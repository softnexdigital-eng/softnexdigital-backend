const prisma = require("../models");

/**
 * Get onboarding status
 * GET /api/onboarding/status
 * Returns onboarding completion status and steps
 */
const getOnboardingStatus = async (req, res) => {
  try {
    const user = req.user;

    // Validate user is authenticated
    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    // For super admin users without tenant
    if (!user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Super admin users do not have a tenant.",
      });
    }

    // Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Return onboarding status with steps
    const onboardingData = {
      onboardingCompleted: tenant.onboardingCompleted,
      steps: [
        "Profile Setup",
        "Product Setup",
        "Landing Page",
      ],
    };

    return res.status(200).json({
      success: true,
      data: onboardingData,
    });
  } catch (error) {
    console.error("Get onboarding status error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch onboarding status.",
    });
  }
};

/**
 * Complete onboarding
 * POST /api/onboarding/complete
 * Sets onboardingCompleted = true on the tenant
 */
const completeOnboarding = async (req, res) => {
  try {
    const user = req.user;

    // Validate user is authenticated
    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    // For super admin users without tenant
    if (!user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Super admin users do not have a tenant.",
      });
    }

    // Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Validate that profile name is set
    if (!tenant.name || tenant.name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Please complete your profile setup before marking onboarding as complete.",
      });
    }

    // Update onboarding status
    const updatedTenant = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        onboardingCompleted: true,
      },
    });

    // Parse featureFlags from JSON string
    const tenantData = {
      id: updatedTenant.id,
      name: updatedTenant.name,
      email: updatedTenant.email,
      phone: updatedTenant.phone,
      logo: updatedTenant.logo,
      address: updatedTenant.address,
      timezone: updatedTenant.timezone,
      onboardingCompleted: updatedTenant.onboardingCompleted,
      package: updatedTenant.package,
      status: updatedTenant.status,
      featureFlags: updatedTenant.featureFlags ? JSON.parse(updatedTenant.featureFlags) : {},
      preferences: updatedTenant.preferences || {},
      createdAt: updatedTenant.createdAt,
      updatedAt: updatedTenant.updatedAt,
    };

    return res.status(200).json({
      success: true,
      message: "Onboarding completed successfully.",
      data: tenantData,
    });
  } catch (error) {
    console.error("Complete onboarding error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to complete onboarding.",
    });
  }
};

module.exports = {
  getOnboardingStatus,
  completeOnboarding,
};
