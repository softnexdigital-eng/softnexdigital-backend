const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireActiveTenant } = require("../middleware/requireActiveTenant");
const {
  listBest3Products,
  setBest3Products,
  toggleBest3Product,
  removeBest3Product,
} = require("../controllers/best3ProductController");

const router = express.Router();

router.use(protect);
router.use(requireActiveTenant);

router.get("/", listBest3Products);
router.post("/", setBest3Products);
router.patch("/:id/toggle", toggleBest3Product);
router.delete("/:id", removeBest3Product);

module.exports = router;
