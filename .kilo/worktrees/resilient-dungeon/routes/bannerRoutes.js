const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireActiveTenant } = require("../middleware/requireActiveTenant");
const {
  createBanner,
  getBanners,
  getCategoriesForBanner,
  getBanner,
  updateBanner,
  deleteBanner,
} = require("../controllers/bannerController");

const router = express.Router();

router.use(protect);

// Banner management routes - require active tenant
router.post("/", requireActiveTenant, createBanner);
router.get("/", requireActiveTenant, getBanners);
router.get("/categories", requireActiveTenant, getCategoriesForBanner);
router.get("/:id", requireActiveTenant, getBanner);
router.put("/:id", requireActiveTenant, updateBanner);
router.delete("/:id", requireActiveTenant, deleteBanner);

module.exports = router;