const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  listIncompleteCheckouts,
  getIncompleteCheckout,
  deleteIncompleteCheckout,
  getIncompleteCheckoutStats,
} = require("../controllers/incompleteCheckoutController");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Stats
router.get("/stats", getIncompleteCheckoutStats);

// CRUD
router.get("/", listIncompleteCheckouts);
router.get("/:id", getIncompleteCheckout);
router.delete("/:id", deleteIncompleteCheckout);

module.exports = router;