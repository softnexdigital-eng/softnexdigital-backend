const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  register,
  verify,
  resendOtp,
  loginWithPassword,
  setPassword,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
} = require("../controllers/authController");

/**
 * POST /api/auth/register
 * Register a new user with email
 */
router.post("/register", register);

/**
 * POST /api/auth/verify
 * Verify OTP and get JWT token
 */
router.post("/verify", verify);

/**
 * POST /api/auth/resend-otp
 * Resend OTP to email
 */
router.post("/resend-otp", resendOtp);

/**
 * POST /api/auth/login-password
 * Login with email & password (for SUPER_ADMIN or users with password)
 */
router.post("/login-password", loginWithPassword);

/**
 * POST /api/auth/forgot-password
 * Send password reset link via email
 */
router.post("/forgot-password", forgotPassword);

/**
 * POST /api/auth/reset-password
 * Reset password with token from email
 */
router.post("/reset-password", resetPassword);

/**
 * Protected routes below - require authentication
 */
/**
 * GET /api/auth/me
 * Get current user profile with password status
 */
router.get("/me", protect, getMe);

/**
 * POST /api/auth/set-password
 * Set initial password (after first OTP login)
 */
router.post("/set-password", protect, setPassword);

/**
 * POST /api/auth/change-password
 * Change password (requires current password)
 */
router.post("/change-password", protect, changePassword);

module.exports = router;