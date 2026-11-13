const prisma = require("../models");
const { isTenantAdmin } = require("./businessAuthorization");
const { hasBranchPermission } = require("../services/branchPermissions");

const createRequireBranchAccess = (db, options = {}) => async (req, res, next) => {
  const { tenantId, id: userId } = req.user || {};
  const branchId = req.params.branchId || req.query.branchId || req.headers["x-branch-id"];

  if (!tenantId || !userId) {
    return res.status(403).json({ success: false, message: "A tenant account is required" });
  }
  if (!branchId) {
    if (options.required) {
      return res.status(400).json({ success: false, message: "branchId is required" });
    }
    return next();
  }

  try {
    const branch = await db.branch.findFirst({
      where: { id: branchId, tenantId },
      select: { id: true, isActive: true, managerId: true },
    });
    if (!branch) {
      return res.status(404).json({ success: false, message: "Branch not found" });
    }
    if (!branch.isActive && !options.allowInactive) {
      return res.status(403).json({ success: false, message: "Branch is inactive" });
    }
    if (isTenantAdmin(req.user)) {
      req.branch = branch;
      return next();
    }

    const activeUser = await db.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!activeUser) {
      return res.status(403).json({ success: false, message: "Active tenant membership is required" });
    }

    const membership = await db.branchMembership.findFirst({
      where: { tenantId, branchId, userId, isActive: true },
      select: { id: true, role: true, permissions: true },
    });
    const isActiveManager = branch.managerId === userId;
    if (!membership && !isActiveManager) {
      return res.status(403).json({ success: false, message: "You do not have access to this branch" });
    }

    const permission = options.permission;
    if (permission) {
      const allowed = hasBranchPermission(membership, permission);
      const managerAllowed = isActiveManager && permission.startsWith("branches.");
      if (!allowed && !managerAllowed) {
        return res.status(403).json({ success: false, message: "Branch permission required" });
      }
    }

    req.branch = branch;
    req.branchMembership = membership || null;
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireBranchAccess = (options = {}) => createRequireBranchAccess(prisma, options);
const requireBranchPermission = (permission, options = {}) =>
  requireBranchAccess({ ...options, permission, required: true });

module.exports = {
  createRequireBranchAccess,
  requireBranchAccess,
  requireBranchPermission,
};
