const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const prisma = require("../models");
const { generateOTP, saveOtp, verifyOtp, deleteOtp } = require("../utils/otpStore");
const { sendOtpEmail } = require("../utils/emailService");
const { createSuperAdminNotification } = require("../utils/superAdminNotifications");
const { ensureTenantDefaultBranch } = require("../utils/branchDefaults");

/**
 * Register / Request OTP (works for both new and existing users)
 * POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    let existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    let userId, tenantId;

    if (existingUser) {
      // User exists – just send OTP for login
      userId = existingUser.id;
      tenantId = existingUser.tenantId;
      console.log(`Existing user ${normalizedEmail} requested OTP`);
    } else {
      // Check if a tenant already exists with this email
      let tenant = await prisma.tenant.findUnique({
        where: { email: normalizedEmail },
      });

      if (!tenant) {
        // Create new tenant with PENDING_APPROVAL status (payment required)
        tenant = await prisma.tenant.create({
          data: {
            name: normalizedEmail.split("@")[0],
            email: normalizedEmail,
            phone: null,
            package: "FREE",
            status: "PENDING_APPROVAL",        // Changed from ACTIVE
            paymentStatus: "PENDING",          // New: payment pending
            featureFlags: "{}",                // Stringified JSON
          },
        });

        // Auto-create a landing page for the new tenant (optional)
        const slug = (normalizedEmail.split("@")[0] + "-" + tenant.id.slice(0, 6)).toLowerCase().replace(/[^a-z0-9-]/g, '');
        const defaultSections = [
          { id: "hero", type: "hero", content: { title: "Welcome!", subtitle: "Your product here", ctaText: "Order Now" } },
          { id: "benefits", type: "benefits", content: { items: ["Premium Quality", "Fast Delivery", "Best Price"] } },
          { id: "order-form", type: "order-form", content: { title: "Order Now" } },
        ];
        const defaultStyles = { primaryColor: "#10b981", fontFamily: "'Hind Siliguri', sans-serif", background: "#f0fdf4" };
        await prisma.landingPage.create({
          data: {
            tenantId: tenant.id,
            templateId: "default",
            title: tenant.name,
            slug,
            sections: defaultSections,
            styles: defaultStyles,
            seo: { title: tenant.name, description: "" },
            published: true,
          },
        }).catch(err => console.error("Failed to create landing page for new tenant:", err.message));
      }

      // Create user for this tenant
      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          password: null,
          role: "BUSINESS_ADMIN",
          tenantId: tenant.id,
        },
      });
      await ensureTenantDefaultBranch(prisma, tenant.id);

      if (tenant.status === "PENDING_APPROVAL") {
        await createSuperAdminNotification({
          type: "NEW_REGISTRATION",
          title: "New registration request",
          message: `${tenant.name} submitted a registration request.`,
          entityId: tenant.id,
          tenantId: tenant.id,
        });
      }

      userId = user.id;
      tenantId = tenant.id;
      existingUser = user;
      console.log(`New user created: ${normalizedEmail}`);
    }

    // Generate and save OTP (5 minutes expiry)
    const otp = generateOTP();
    saveOtp(normalizedEmail, otp, 300);

    // Send OTP email
    await sendOtpEmail(normalizedEmail, otp);

    return res.status(201).json({
      success: true,
      message: existingUser ? "OTP sent to your email." : "Registration initiated. OTP sent to email.",
      data: {
        email: normalizedEmail,
        userId,
        tenantId,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Registration failed.",
    });
  }
};

/**
 * Verify OTP and get JWT token
 * POST /api/auth/verify
 */
const verify = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const isValidOtp = verifyOtp(normalizedEmail, otp);
    if (!isValidOtp) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Delete used OTP
    deleteOtp(normalizedEmail);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    );

    // Get tenant status and payment status
    const tenant = user.tenant;
    const tenantStatus = tenant?.status || null;
    const paymentStatus = tenant?.paymentStatus || null;

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully.",
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantStatus,      // 👈 added
          paymentStatus,     // 👈 added
        },
      },
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Verification failed.",
    });
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      });
    }

    const otp = generateOTP();
    saveOtp(normalizedEmail, otp, 300);
    await sendOtpEmail(normalizedEmail, otp);

    return res.status(200).json({
      success: true,
      message: "OTP resent to email.",
      data: { email: normalizedEmail },
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to resend OTP.",
    });
  }
};

/**
 * Login with Email & Password (for SUPER_ADMIN or any user with password)
 * POST /api/auth/login-password
 */
const loginWithPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Check if user has a password set
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: "Password not set for this account. Please use OTP login.",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    );

    const tenant = user.tenant;
    const tenantStatus = tenant?.status || null;
    const paymentStatus = tenant?.paymentStatus || null;

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantStatus,      // 👈 added
          paymentStatus,     // 👈 added
        },
      },
    });
  } catch (error) {
    console.error("Login with password error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Login failed.",
    });
  }
};

/**
 * Set initial password (after first OTP login)
 * POST /api/auth/set-password
 */
const setPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return res.status(200).json({ success: true, message: "Password set successfully" });
  } catch (error) {
    console.error("Set password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to set password" });
  }
};

/**
 * Change password (requires current password)
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // If user has a current password, verify it
    if (user.password) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ success: false, message: "Current password is incorrect" });
      }
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to change password" });
  }
};

/**
 * Forgot password - send reset link via email
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      // Don't reveal if email exists
      return res.status(200).json({ success: true, message: "If the email exists, a reset link has been sent" });
    }

    // Generate reset token (JWT with short expiry)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email, purpose: "password_reset" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const { sendPasswordResetEmail } = require("../utils/emailService");
    await sendPasswordResetEmail(normalizedEmail, resetToken);

    return res.status(200).json({ success: true, message: "Password reset link sent to your email" });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process request" });
  }
};

/**
 * Reset password with token (from email link)
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and password are required" });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired reset token" });
    }

    if (decoded.purpose !== "password_reset") {
      return res.status(401).json({ success: false, message: "Invalid reset token" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hashedPassword },
    });

    return res.status(200).json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to reset password" });
  }
};

/**
 * Get current user profile (with password status)
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        isActive: true,
        isPaymentSubmitted: true,
        password: true,
        tenant: {
          select: {
            status: true,
            paymentStatus: true,
            businessType: true,
            enabledModules: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        isActive: user.isActive,
        isPaymentSubmitted: user.isPaymentSubmitted,
        tenantStatus: user.tenant?.status || null,
        paymentStatus: user.tenant?.paymentStatus || null,
        businessType: user.tenant?.businessType || 'RETAIL',
        enabledModules: user.tenant?.enabledModules || ['catalog', 'orders', 'customers', 'inventory'],
        hasPassword: !!user.password,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  verify,
  resendOtp,
  loginWithPassword,
  setPassword,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
};
