const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getAdminReviews,
  toggleReviewApproval,
  adminDeleteReview,
} = require("../controllers/reviewController");

const router = express.Router();
router.use(protect);

// GET /api/reviews/:tenantId - list all reviews for admin
router.get("/:tenantId", getAdminReviews);

// PATCH /api/reviews/:id/toggle-approval - toggle approval status
router.patch("/:id/toggle-approval", toggleReviewApproval);

// DELETE /api/reviews/:id - admin delete any review
router.delete("/:id", adminDeleteReview);

module.exports = router;