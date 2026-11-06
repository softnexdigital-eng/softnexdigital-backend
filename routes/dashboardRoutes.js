const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getStats } = require("../controllers/dashboardController");

/**
 * Dashboard Routes
 * Base path: /api/dashboard
 */

// GET /api/dashboard/stats - Get dashboard statistics (protected)
router.get("/stats", protect, getStats);

module.exports = router;
