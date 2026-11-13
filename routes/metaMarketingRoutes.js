const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { rateLimiter } = require("../middleware/rateLimit");
const metaMarketingController = require("../controllers/metaMarketingController");

const router = express.Router();

router.get("/settings", protect, metaMarketingController.getSettings);
router.put("/settings", protect, metaMarketingController.updateSettings);
router.post("/test", protect, rateLimiter, metaMarketingController.sendTestEvent);
router.get("/config/:slug", metaMarketingController.getPublicConfig);
router.post("/events", rateLimiter, metaMarketingController.trackPublicEvent);

module.exports = router;
