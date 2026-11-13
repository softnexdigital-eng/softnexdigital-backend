const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getProfile, updateProfile } = require("../controllers/shopController");

/**
 * Shop Routes
 * Base path: /api/shop
 */

// GET /api/shop/profile - Get shop profile (protected)
router.get("/profile", protect, getProfile);

// PUT /api/shop/profile - Update shop profile (protected)
router.put("/profile", protect, updateProfile);

module.exports = router;
