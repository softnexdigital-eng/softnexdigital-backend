const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getSettings, updateSettings } = require("../controllers/settingsController");

/**
 * Settings Routes
 * Base path: /api/settings
 */

// GET /api/settings - Get settings (protected)
router.get("/", protect, getSettings);

// PUT /api/settings - Update settings (protected)
router.put("/", protect, updateSettings);

module.exports = router;
