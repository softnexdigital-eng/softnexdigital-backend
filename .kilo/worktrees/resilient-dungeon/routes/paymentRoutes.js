const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  submitPayment,
  listPendingPayments,
  approvePayment,
  rejectPayment,
} = require("../controllers/paymentController");

const router = express.Router();

// User routes (protected)
router.post("/submit", protect, submitPayment);

// Super Admin routes (protect + role check inside controller)
router.get("/admin/pending", protect, listPendingPayments);
router.patch("/admin/approve/:tenantId", protect, approvePayment);
router.patch("/admin/reject/:tenantId", protect, rejectPayment);

module.exports = router;