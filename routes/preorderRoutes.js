const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireActiveTenant } = require("../middleware/requireActiveTenant");
const {
  listPreOrderVariants,
  toggleVariantPreOrder,
  updatePreOrderSettings,
  listPreOrderEnabled,
} = require("../controllers/preorderController");

const router = express.Router();

router.use(protect);
router.use(requireActiveTenant);

router.get("/", listPreOrderVariants);
router.get("/enabled", listPreOrderEnabled);
router.patch("/:id/toggle", toggleVariantPreOrder);
router.put("/:id", updatePreOrderSettings);

module.exports = router;
