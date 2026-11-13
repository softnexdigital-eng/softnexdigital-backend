const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  blockPhone,
  unblockPhone,
  listBlockedPhones,
  blockIp,
  unblockIp,
  listBlockedIps,
  getBlockSettings,
  updateBlockSettings,
} = require("../controllers/blockingController");

const router = express.Router();
router.use(protect);

// ── Phone Blocking ──
router.get("/phones", listBlockedPhones);
router.post("/phones", blockPhone);
router.delete("/phones/:phone", unblockPhone);

// ── IP Blocking ──
router.get("/ips", listBlockedIps);
router.post("/ips", blockIp);
router.delete("/ips/:ip", unblockIp);

// ── Block Settings ──
router.get("/settings", getBlockSettings);
router.put("/settings", updateBlockSettings);

module.exports = router;