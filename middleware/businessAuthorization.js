const TENANT_ADMIN_ROLES = new Set(["SUPER_ADMIN", "TENANT_OWNER", "BUSINESS_ADMIN", "OWNER"]);

const requireTenantUser = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  if (!req.user.tenantId) {
    return res.status(403).json({ success: false, message: "A tenant account is required" });
  }
  next();
};

const requireTenantAdmin = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  if (!req.user.tenantId) {
    return res.status(403).json({ success: false, message: "A tenant account is required" });
  }
  if (!TENANT_ADMIN_ROLES.has(req.user.role)) {
    return res.status(403).json({ success: false, message: "Tenant administrator permission required" });
  }
  next();
};

const isTenantAdmin = (user) => Boolean(user && TENANT_ADMIN_ROLES.has(user.role));

module.exports = {
  isTenantAdmin,
  requireTenantAdmin,
  requireTenantUser,
};
