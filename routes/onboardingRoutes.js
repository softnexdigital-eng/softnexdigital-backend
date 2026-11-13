const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getOnboardingStatus, completeOnboarding } = require("../controllers/onboardingController");

/**
 * Onboarding Routes
 * Base path: /api/onboarding
 */

// GET /api/onboarding/status - Get onboarding status (protected)
router.get("/status", protect, getOnboardingStatus);

// POST /api/onboarding/complete - Complete onboarding (protected)
router.post("/complete", protect, completeOnboarding);

module.exports = router;
