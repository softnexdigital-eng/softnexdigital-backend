const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireTenantAdmin, requireTenantUser } = require("../middleware/businessAuthorization");
const { requireBranchAccess, requireBranchPermission } = require("../middleware/branchAuthorization");
const { createBusinessFoundationController } = require("../controllers/businessFoundationController");
const prisma = require("../models");

const controller = createBusinessFoundationController(prisma);
const router = express.Router();

router.use(protect, requireTenantUser);
router.route("/")
  .get(controller.listBranches)
  .post(requireTenantAdmin, controller.createBranch);

router.get("/permissions", controller.getBranchPermissionCatalog);
router.get("/:branchId/members", requireBranchPermission("branches.members.view"), controller.listBranchMembers);
router.post("/:branchId/members", requireTenantAdmin, requireBranchAccess(), controller.addBranchMember);
router.patch("/:branchId/members/:membershipId", requireTenantAdmin, requireBranchAccess(), controller.updateBranchMember);
router.delete("/:branchId/members/:membershipId", requireTenantAdmin, requireBranchAccess(), controller.removeBranchMember);
router.patch("/:branchId/default", requireTenantAdmin, requireBranchAccess({ allowInactive: true }), controller.setDefaultBranch);
router.patch("/:branchId/status", requireTenantAdmin, requireBranchAccess({ allowInactive: true }), controller.updateBranchStatus);
router.route("/:branchId")
  .get(requireBranchAccess({ allowInactive: true }), controller.getBranch)
  .put(requireTenantAdmin, requireBranchAccess({ allowInactive: true }), controller.updateBranch);

module.exports = router;
