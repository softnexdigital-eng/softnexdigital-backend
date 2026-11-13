const prisma = require("../models");

/**
 * Get settings
 * GET /api/settings
 * Returns current tenant settings (package, timezone, preferences, system settings)
 */
const getSettings = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    if (!user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Super admin users do not have a tenant.",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found.",
      });
    }

    // Return settings with all form fields
    const settingsData = {
      package: tenant.package,
      timezone: tenant.timezone,
      currency: tenant.currency,
      currencySymbol: tenant.currencySymbol,
      taxPercentage: tenant.taxPercentage,
      deliveryCharge: tenant.deliveryCharge,
      companyName: tenant.companyName,
      tenantEmail: tenant.tenantEmail,
      phone: tenant.phone,
      phone2: tenant.phone2,
      address: tenant.address,
      logo: tenant.logo,
      socialLinks: tenant.socialLinks || {},
      termsAndConditions: tenant.termsAndConditions || "",
      productFeatures: tenant.productFeatures || {},
      steadfastApiKey: tenant.steadfastApiKey || "",
      steadfastSecretKey: tenant.steadfastSecretKey ? "••••••••" : "",
    };

    return res.status(200).json({
      success: true,
      data: settingsData,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch settings.",
    });
  }
};

/**
 * Update settings
 * PUT /api/settings
 * Update all form-based fields
 */
const updateSettings = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    if (!user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Super admin users do not have a tenant.",
      });
    }

    const {
      timezone,
      currency,
      currencySymbol,
      taxPercentage,
      deliveryCharge,
      companyName,
      tenantEmail,
      phone,
      phone2,
      address,
      logo,
      socialLinks,
      termsAndConditions,
      productFeatures,
      steadfastApiKey,
      steadfastSecretKey,
    } = req.body;

    // Build update data object with only provided fields
    const updateData = {};
    if (timezone !== undefined) updateData.timezone = timezone;
    if (currency !== undefined) updateData.currency = currency;
    if (currencySymbol !== undefined) updateData.currencySymbol = currencySymbol;
    if (taxPercentage !== undefined) updateData.taxPercentage = parseFloat(taxPercentage) || 0;
    if (deliveryCharge !== undefined) updateData.deliveryCharge = parseFloat(deliveryCharge) || 0;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (tenantEmail !== undefined) updateData.tenantEmail = tenantEmail;
    if (phone !== undefined) updateData.phone = phone;
    if (phone2 !== undefined) updateData.phone2 = phone2;
    if (address !== undefined) updateData.address = address;
    if (logo !== undefined) updateData.logo = logo;
    if (socialLinks !== undefined) {
      if (typeof socialLinks === "object" && !Array.isArray(socialLinks)) {
        updateData.socialLinks = socialLinks;
      }
    }
    if (termsAndConditions !== undefined) updateData.termsAndConditions = termsAndConditions;
    if (productFeatures !== undefined) {
      if (typeof productFeatures === "object" && !Array.isArray(productFeatures)) {
        updateData.productFeatures = productFeatures;
      }
    }
    if (steadfastApiKey !== undefined) updateData.steadfastApiKey = steadfastApiKey;
    if (steadfastSecretKey !== undefined) updateData.steadfastSecretKey = steadfastSecretKey;

    // Update tenant settings
    const updatedTenant = await prisma.tenant.update({
      where: { id: user.tenantId },
      data: updateData,
    });

    // Return updated settings
    const settingsData = {
      package: updatedTenant.package,
      timezone: updatedTenant.timezone,
      currency: updatedTenant.currency,
      currencySymbol: updatedTenant.currencySymbol,
      taxPercentage: updatedTenant.taxPercentage,
      deliveryCharge: updatedTenant.deliveryCharge,
      companyName: updatedTenant.companyName,
      tenantEmail: updatedTenant.tenantEmail,
      phone: updatedTenant.phone,
      phone2: updatedTenant.phone2,
      address: updatedTenant.address,
      logo: updatedTenant.logo,
      socialLinks: updatedTenant.socialLinks || {},
      termsAndConditions: updatedTenant.termsAndConditions || "",
      productFeatures: updatedTenant.productFeatures || {},
      steadfastApiKey: updatedTenant.steadfastApiKey || "",
      steadfastSecretKey: updatedTenant.steadfastSecretKey ? "••••••••" : "",
    };

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully.",
      data: settingsData,
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update settings.",
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};