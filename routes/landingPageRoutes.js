const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireActiveTenant } = require("../middleware/requireActiveTenant");
const {
  getLandingPage,
  updateLandingPage,
  publishLandingPage,
  getTemplates,
} = require("../controllers/landingPageController");

const router = express.Router();

router.use(protect); // সব রাউট প্রোটেক্টেড

// Landing page builder routes - require active tenant (payment approved)
router.get("/", requireActiveTenant, getLandingPage);
router.put("/", requireActiveTenant, updateLandingPage);
router.patch("/publish", requireActiveTenant, publishLandingPage);

// Templates route - does NOT require active tenant (users can preview before paying)
router.get("/templates", getTemplates);

module.exports = router;
