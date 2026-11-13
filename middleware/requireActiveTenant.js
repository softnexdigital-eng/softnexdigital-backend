const prisma = require("../models");

const requireActiveTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "No tenant associated" });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Your store is not active. Please complete payment and wait for approval." });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireActiveTenant };