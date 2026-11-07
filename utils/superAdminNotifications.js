const prisma = require("../models");

const createSuperAdminNotification = async ({ type, title, message, entityId, tenantId }) => {
  try {
    return await prisma.superAdminNotification.create({
      data: { type, title, message, entityId, tenantId },
    });
  } catch (error) {
    console.error(`Failed to create super admin notification (${type}):`, error);
    return null;
  }
};

module.exports = { createSuperAdminNotification };
