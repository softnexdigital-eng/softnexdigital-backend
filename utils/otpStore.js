const otpStore = new Map();

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Save OTP to in-memory store
 * @param {string} email - User email
 * @param {string} otp - OTP code
 * @param {number} expiresSec - Expiration time in seconds (default: 300 = 5 minutes)
 */
function saveOtp(email, otp, expiresSec = 300) {
  const expiresAt = new Date(Date.now() + expiresSec * 1000);
  otpStore.set(email, { otp, expiresAt });
}

/**
 * Verify OTP
 * @param {string} email - User email
 * @param {string} otp - OTP code to verify
 * @returns {boolean} - True if OTP is valid and not expired
 */
function verifyOtp(email, otp) {
  const stored = otpStore.get(email);

  if (!stored) {
    return false;
  }

  const isExpired = new Date() > stored.expiresAt;
  const isValid = stored.otp === otp && !isExpired;

  if (isValid) {
    deleteOtp(email);
  }

  return isValid;
}

/**
 * Delete OTP from store
 * @param {string} email - User email
 */
function deleteOtp(email) {
  otpStore.delete(email);
}

/**
 * Check if OTP for email is expired
 * @param {string} email - User email
 * @returns {boolean} - True if OTP is expired or doesn't exist
 */
function isExpired(email) {
  const stored = otpStore.get(email);

  if (!stored) {
    return true;
  }

  return new Date() > stored.expiresAt;
}

/**
 * Get OTP from store (for testing/debugging)
 * @param {string} email - User email
 * @returns {object|null} - OTP object or null
 */
function getOtp(email) {
  return otpStore.get(email) || null;
}

module.exports = {
  generateOTP,
  saveOtp,
  verifyOtp,
  deleteOtp,
  isExpired,
  getOtp,
};
