const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireBranchAccess, requireBranchPermission } = require("../middleware/branchAuthorization");
const {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  submitPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  createSupplierPayment,
  listSupplierPayments,
  getSupplierLedger,
} = require("../controllers/purchaseController");

const router = express.Router();

router.use(protect);

router.get("/", requireBranchAccess({ required: true }), listPurchaseOrders);
router.post("/", requireBranchPermission("purchase.create"), createPurchaseOrder);
router.get("/:id", requireBranchAccess({ required: true }), getPurchaseOrder);
router.patch("/:id", requireBranchPermission("purchase.edit"), updatePurchaseOrder);
router.post("/:id/submit", requireBranchPermission("purchase.submit"), submitPurchaseOrder);
router.post("/:id/cancel", requireBranchPermission("purchase.cancel"), cancelPurchaseOrder);
router.post("/:id/receive", requireBranchPermission("purchase.receive"), receivePurchaseOrder);

router.post("/payments", requireBranchPermission("purchase.pay"), createSupplierPayment);
router.get("/payments", requireBranchAccess({ required: true }), listSupplierPayments);
router.get("/suppliers/:supplierId/ledger", requireBranchAccess({ required: true }), getSupplierLedger);

module.exports = router;