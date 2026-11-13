const crypto = require("crypto");
const axios = require("axios");
const prisma = require("../models");

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v23.0";
const GRAPH_API_VERSION_PATTERN = /^v\d+\.\d+$/;
const EVENT_ID_MAX_LENGTH = 100;
const PENDING_RETRY_AFTER_MS = 2 * 60 * 1000;

function getEncryptionKey() {
  const configuredKey = process.env.META_CAPI_ENCRYPTION_KEY;
  if (!configuredKey) {
    const error = new Error("Meta CAPI encryption key is not configured");
    error.statusCode = 503;
    error.status = 503;
    throw error;
  }
  if (!/^[\da-fA-F]{64}$/.test(configuredKey)) {
    const error = new Error("Meta CAPI encryption key must be 64 hexadecimal characters");
    error.statusCode = 503;
    error.status = 503;
    throw error;
  }
  return Buffer.from(configuredKey, "hex");
}

function encryptAccessToken(accessToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptAccessToken(encryptedToken) {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext, extra] =
    String(encryptedToken).split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedAuthTag ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error("Stored Meta access token has an unsupported format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedAuthTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function normalizeAndHash(value, normalizer) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = normalizer(value);
  if (!normalized) return undefined;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function buildUserData(userData = {}) {
  const data = {};
  const emailHash = normalizeAndHash(userData.email, value => value.trim().toLowerCase());
  const phoneHash = normalizeAndHash(userData.phone, value => {
    const digits = value.replace(/\D/g, "");
    return digits.length === 11 && digits.startsWith("0") ? `88${digits}` : digits;
  });
  if (emailHash) data.em = [emailHash];
  if (phoneHash) data.ph = [phoneHash];
  if (typeof userData.ipAddress === "string" && userData.ipAddress.length <= 64) {
    data.client_ip_address = userData.ipAddress;
  }
  if (typeof userData.userAgent === "string" && userData.userAgent.length <= 500) {
    data.client_user_agent = userData.userAgent;
  }
  if (typeof userData.fbp === "string" && userData.fbp.length <= 200) data.fbp = userData.fbp;
  if (typeof userData.fbc === "string" && userData.fbc.length <= 200) data.fbc = userData.fbc;
  return data;
}

function validateEventSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("A valid eventSourceUrl is required");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A valid eventSourceUrl is required");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error("eventSourceUrl must be a public HTTP or HTTPS URL");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getErrorMessage(error) {
  const message = error.response?.data?.error?.message || error.message || "Meta event delivery failed";
  return String(message).slice(0, 500);
}

async function claimEvent(tenantId, eventId, eventName) {
  const existingKey = { tenantId_eventId: { tenantId, eventId } };
  try {
    return await prisma.metaTrackingEvent.create({
      data: { tenantId, eventId, eventName, status: "SENDING" },
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }

  const existing = await prisma.metaTrackingEvent.findUnique({ where: existingKey });
  if (!existing) throw new Error("Could not retrieve Meta event delivery record");
  if (existing.eventName !== eventName) {
    throw new Error("eventId has already been used for a different Meta event");
  }
  if (existing.status === "SENT") return { duplicate: true, status: "SENT" };

  const staleSending = existing.status === "SENDING" &&
    existing.updatedAt.getTime() < Date.now() - PENDING_RETRY_AFTER_MS;
  if (existing.status === "FAILED" || staleSending) {
    const claimed = await prisma.metaTrackingEvent.updateMany({
      where: {
        id: existing.id,
        status: existing.status,
        ...(staleSending
          ? { updatedAt: { lt: new Date(Date.now() - PENDING_RETRY_AFTER_MS) } }
          : {}),
      },
      data: { status: "SENDING", errorMessage: null, updatedAt: new Date() },
    });
    if (claimed.count === 1) return { id: existing.id, duplicate: false };
    return { duplicate: true, status: "SENDING" };
  }

  return { duplicate: true, status: existing.status };
}

async function sendMetaEvent({
  tenantId,
  eventName,
  eventId,
  eventSourceUrl,
  userData,
  customData,
  testEventCode,
}) {
  if (!GRAPH_API_VERSION_PATTERN.test(GRAPH_API_VERSION)) {
    throw new Error("META_GRAPH_API_VERSION must use the format vNN.N");
  }
  if (
    typeof eventId !== "string" ||
    eventId.length < 1 ||
    eventId.length > EVENT_ID_MAX_LENGTH
  ) {
    throw new Error(`eventId must be between 1 and ${EVENT_ID_MAX_LENGTH} characters`);
  }

  const config = await prisma.metaPixelConfig.findUnique({ where: { tenantId } });
  if (!config?.enabled || !config.pixelId) {
    return { sent: false, reason: "tracking_disabled" };
  }
  if (!config.accessTokenEncrypted) {
    return { sent: false, reason: "conversions_api_not_configured" };
  }

  const sourceUrl = validateEventSourceUrl(eventSourceUrl);
  const accessToken = decryptAccessToken(config.accessTokenEncrypted);
  const claim = await claimEvent(tenantId, eventId, eventName);
  if (claim.duplicate) {
    return { sent: claim.status === "SENT", duplicate: true, status: claim.status };
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: sourceUrl,
    user_data: buildUserData(userData),
    ...(customData ? { custom_data: customData } : {}),
  };

  try {
    const payload = { data: [event] };
    if (testEventCode) payload.test_event_code = testEventCode;
    const response = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(config.pixelId)}/events`,
      payload,
      {
        params: { access_token: accessToken },
        timeout: 8000,
      },
    );
    if (response.data?.events_received !== 1) {
      throw new Error("Meta did not confirm receipt of the event");
    }
    await prisma.metaTrackingEvent.update({
      where: { id: claim.id },
      data: { status: "SENT", sentAt: new Date(), errorMessage: null },
    });
    return { sent: true, eventsReceived: response.data.events_received };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    await prisma.metaTrackingEvent.update({
      where: { id: claim.id },
      data: { status: "FAILED", errorMessage },
    });
    const deliveryError = new Error(errorMessage);
    deliveryError.status = 502;
    throw deliveryError;
  }
}

module.exports = {
  decryptAccessToken,
  encryptAccessToken,
  sendMetaEvent,
  validateEventSourceUrl,
};
