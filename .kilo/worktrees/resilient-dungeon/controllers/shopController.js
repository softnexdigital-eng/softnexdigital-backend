const prisma = require("../models");

/**
 * Get shop profile
 * GET /api/shop/profile
 * Returns current tenant's full profile
 */
const getProfile = async (req, res) => {
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
        message: "Super admin users do not have a tenant profile.",
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

    // Parse featureFlags from JSON string
    const tenantData = {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      logo: tenant.logo,
      address: tenant.address,
      timezone: tenant.timezone,
      onboardingCompleted: tenant.onboardingCompleted,
      package: tenant.package,
      status: tenant.status,
      featureFlags: tenant.featureFlags ? JSON.parse(tenant.featureFlags) : {},
      preferences: tenant.preferences || {},
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };

    return res.status(200).json({
      success: true,
      data: tenantData,
    });
  } catch (error) {
    console.error("Get shop profile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch shop profile.",
    });
  }
};

/**
 * Update shop profile
 * PUT /api/shop/profile
 * Updates allowed fields: name, phone, logo, address, timezone
 */
const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { name, phone, logo, address, timezone } = req.body;

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
        message: "Super admin users do not have a tenant profile.",
      });
    }

    // Validate name is not empty if provided
    if (name !== undefined && name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty.",
      });
    }

    // Build update data object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (logo !== undefined) updateData.logo = logo;
    if (address !== undefined) updateData.address = address;
    if (timezone !== undefined) updateData.timezone = timezone;

    // Update tenant
    const updatedTenant = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: updateData,
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
      message: "Shop profile updated successfully.",
      data: tenantData,
    });
  } catch (error) {
    console.error("Update shop profile error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update shop profile.",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
