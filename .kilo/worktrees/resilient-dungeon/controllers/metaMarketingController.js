const crypto = require("crypto");
const prisma = require("../models");
const {
  encryptAccessToken,
  sendMetaEvent,
  validateEventSourceUrl,
} = require("../utils/metaConversionsApi");

const CLIENT_EVENT_NAMES = new Set(["ViewContent", "AddToCart", "InitiateCheckout"]);
const PIXEL_ID_PATTERN = /^\d{5,30}$/;

function getSettingsData(config) {
  const hasAccessToken = Boolean(config?.accessTokenEncrypted);
  return {
    enabled: Boolean(config?.enabled),
    pixelId: config?.pixelId || "",
    hasAccessToken,
    serverTrackingEnabled: Boolean(config?.enabled && config?.pixelId && hasAccessToken),
  };
}

function getTenantId(req, res) {
  if (!req.user?.tenantId || req.user.role === "SUPER_ADMIN") {
    res.status(403).json({
      success: false,
      message: "A store admin account is required to manage Meta tracking.",
    });
    return null;
  }
  return req.user.tenantId;
}

exports.getSettings = async (req, res, next) => {
  const tenantId = getTenantId(req, res);
  if (!tenantId) return;
  try {
    const config = await prisma.metaPixelConfig.findUnique({ where: { tenantId } });
    return res.json({ success: true, data: getSettingsData(config) });
  } catch (error) {
    return next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  const tenantId = getTenantId(req, res);
  if (!tenantId) return;

  const { pixelId, enabled, accessToken, clearAccessToken } = req.body;
  if (pixelId !== undefined && pixelId !== null && pixelId !== "" &&
      (typeof pixelId !== "string" || !PIXEL_ID_PATTERN.test(pixelId.trim()))) {
    return res.status(400).json({
      success: false,
      message: "Pixel ID must contain 5 to 30 digits.",
    });
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ success: false, message: "enabled must be a boolean." });
  }
  if (accessToken !== undefined &&
      (typeof accessToken !== "string" || accessToken.length > 4096)) {
    return res.status(400).json({ success: false, message: "Invalid Conversions API access token." });
  }
  if (clearAccessToken !== undefined && typeof clearAccessToken !== "boolean") {
    return res.status(400).json({ success: false, message: "clearAccessToken must be a boolean." });
  }
  if (clearAccessToken && typeof accessToken === "string" && accessToken.trim()) {
    return res.status(400).json({
      success: false,
      message: "Provide a new access token or clear the existing one, not both.",
    });
  }

  try {
    const existing = await prisma.metaPixelConfig.findUnique({ where: { tenantId } });
    const nextPixelId = pixelId === undefined
      ? existing?.pixelId || null
      : (typeof pixelId === "string" && pixelId.trim() ? pixelId.trim() : null);
    const nextEnabled = enabled === undefined ? Boolean(existing?.enabled) : enabled;
    if (nextEnabled && !nextPixelId) {
      return res.status(400).json({
        success: false,
        message: "Add a valid Pixel ID before enabling Meta tracking.",
      });
    }

    let accessTokenEncrypted = existing?.accessTokenEncrypted || null;
    if (clearAccessToken) {
      accessTokenEncrypted = null;
    } else if (typeof accessToken === "string" && accessToken.trim()) {
      accessTokenEncrypted = encryptAccessToken(accessToken.trim());
    }

    const config = await prisma.metaPixelConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        pixelId: nextPixelId,
        enabled: nextEnabled,
        accessTokenEncrypted,
      },
      update: {
        pixelId: nextPixelId,
        enabled: nextEnabled,
        accessTokenEncrypted,
      },
    });
    return res.json({
      success: true,
      message: "Meta tracking settings saved.",
      data: getSettingsData(config),
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
  }
};

exports.getPublicConfig = async (req, res, next) => {
  try {
    const page = await prisma.landingPage.findUnique({
      where: { slug: req.params.slug },
      select: {
        published: true,
        tenant: {
          select: {
            id: true,
            status: true,
            metaPixelConfig: {
              select: {
                enabled: true,
                pixelId: true,
                accessTokenEncrypted: true,
              },
            },
          },
        },
      },
    });
    if (!page?.published || page.tenant.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Store not found." });
    }

    const config = page.tenant.metaPixelConfig;
    const enabled = Boolean(config?.enabled && config?.pixelId);
    return res.json({
      success: true,
      data: {
        enabled,
        pixelId: enabled ? config.pixelId : null,
        serverTrackingEnabled: Boolean(enabled && config.accessTokenEncrypted),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.trackPublicEvent = async (req, res, next) => {
  const {
    tenantSlug,
    eventName,
    eventId,
    eventSourceUrl,
    productId,
    quantity = 1,
    items,
    consent,
    fbp,
    fbc,
  } = req.body;

  if (consent !== true) {
    return res.status(400).json({
      success: false,
      message: "Marketing consent is required for server-side tracking.",
    });
  }
  if (!CLIENT_EVENT_NAMES.has(eventName)) {
    return res.status(400).json({ success: false, message: "Unsupported Meta event name." });
  }
  if (typeof tenantSlug !== "string" || !tenantSlug.trim()) {
    return res.status(400).json({ success: false, message: "tenantSlug is required." });
  }
  if (typeof eventId !== "string" || !eventId.trim() || eventId.length > 100) {
    return res.status(400).json({
      success: false,
      message: "eventId must contain between 1 and 100 characters.",
    });
  }
  let requestedItems;
  if (Array.isArray(items)) {
    if (items.length < 1 || items.length > 50 || items.some(item =>
      !item || typeof item.productId !== "string" || !item.productId.trim() ||
      !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1000
    )) {
      return res.status(400).json({ success: false, message: "items must contain 1 to 50 valid products and quantities." });
    }
    requestedItems = items;
  } else if (typeof productId === "string" && productId.trim() &&
      Number.isFinite(quantity) && quantity > 0 && quantity <= 1000) {
    requestedItems = [{ productId: productId.trim(), quantity }];
  } else {
    return res.status(400).json({
      success: false,
      message: "Provide a productId and quantity, or an items array.",
    });
  }
  try {
    validateEventSourceUrl(eventSourceUrl);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  try {
    const page = await prisma.landingPage.findUnique({
      where: { slug: tenantSlug.trim() },
      select: {
        published: true,
        tenant: {
          select: {
            id: true,
            status: true,
            currency: true,
            metaPixelConfig: { select: { enabled: true, pixelId: true, accessTokenEncrypted: true } },
          },
        },
      },
    });
    if (!page?.published || page.tenant.status !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Store not found." });
    }
    if (!page.tenant.metaPixelConfig?.enabled || !page.tenant.metaPixelConfig.pixelId) {
      return res.json({ success: true, data: { sent: false, reason: "tracking_disabled" } });
    }
    if (!page.tenant.metaPixelConfig.accessTokenEncrypted) {
      return res.json({ success: true, data: { sent: false, reason: "conversions_api_not_configured" } });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: [...new Set(requestedItems.map(item => item.productId.trim()))] },
        tenantId: page.tenant.id,
      },
      select: { id: true, name: true, basePrice: true },
    });
    if (products.length !== new Set(requestedItems.map(item => item.productId.trim())).size) {
      return res.status(404).json({ success: false, message: "One or more products were not found in this store." });
    }

    const productsById = new Map(products.map(product => [product.id, product]));
    const contents = requestedItems.map(item => {
      const product = productsById.get(item.productId.trim());
      return {
        id: product.id,
        quantity: item.quantity,
        ...(Number.isFinite(product.basePrice) ? { item_price: product.basePrice } : {}),
      };
    });
    const totalValue = requestedItems.reduce((sum, item) => {
      const basePrice = productsById.get(item.productId.trim()).basePrice;
      return Number.isFinite(basePrice) ? sum + basePrice * item.quantity : sum;
    }, 0);
    const customData = {
      content_ids: [...new Set(contents.map(item => item.id))],
      content_type: "product",
      ...(products.length === 1 ? { content_name: products[0].name } : {}),
      contents,
      currency: page.tenant.currency,
      ...(requestedItems.every(item =>
        Number.isFinite(productsById.get(item.productId.trim()).basePrice)
      )
        ? { value: totalValue }
        : {}),
    };
    const result = await sendMetaEvent({
      tenantId: page.tenant.id,
      eventName,
      eventId,
      eventSourceUrl,
      userData: {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        fbp,
        fbc,
      },
      customData,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
};

exports.sendTestEvent = async (req, res, next) => {
  const tenantId = getTenantId(req, res);
  if (!tenantId) return;
  const { testEventCode, eventSourceUrl } = req.body;
  if (typeof testEventCode !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(testEventCode)) {
    return res.status(400).json({ success: false, message: "A valid Meta test event code is required." });
  }
  try {
    validateEventSourceUrl(eventSourceUrl);
    const result = await sendMetaEvent({
      tenantId,
      eventName: "TestEvent",
      eventId: `test_${crypto.randomUUID()}`,
      eventSourceUrl,
      userData: {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      },
      testEventCode,
    });
    if (!result.sent) {
      return res.status(400).json({
        success: false,
        message: "Enable Meta tracking and configure a Pixel ID and Conversions API access token first.",
      });
    }
    return res.json({ success: true, message: "Test event sent to Meta.", data: result });
  } catch (error) {
    if (/eventSourceUrl/.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return next(error);
  }
};
