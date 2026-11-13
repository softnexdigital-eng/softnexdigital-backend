const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getMyTenant } = require("../controllers/tenantController");

/**
 * GET /api/tenant/me
 * Get current user's tenant information (requires auth)
 */
router.get("/me", protect, getMyTenant);

module.exports = router;
