const prisma = require("../models");

/**
 * Get current user's tenant info
 * GET /api/tenant/me
 */
const getMyTenant = async (req, res) => {
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
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Parse featureFlags from JSON string
    const tenantData = {
      ...tenant,
      featureFlags: tenant.featureFlags ? JSON.parse(tenant.featureFlags) : {},
      preferences: tenant.preferences || {},
    };

    return res.status(200).json({
      success: true,
      data: tenantData,
    });
  } catch (error) {
    console.error("Get tenant error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch tenant information.",
    });
  }
};

module.exports = {
  getMyTenant,
};
