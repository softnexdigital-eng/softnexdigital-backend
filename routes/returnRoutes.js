const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  createReturnRequest,
  listReturns,
  updateReturnStatus,
  createRefund,
  trackReturn,
} = require("../controllers/returnController");

const router = express.Router();

// Public routes (no auth)
router.post("/", createReturnRequest);
router.get("/track", trackReturn);

// Protected routes (admin only)
router.use(protect);
router.get("/", listReturns);
router.patch("/:id/status", updateReturnStatus);
router.post("/:id/refund", createRefund);

module.exports = router;