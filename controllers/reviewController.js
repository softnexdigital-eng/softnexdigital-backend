const prisma = require("../models");

/**
 * Create a review (public - no auth required)
 * POST /api/public/reviews
 */
const createReview = async (req, res, next) => {
  try {
    const { tenantId, name, location, text, stars, phone } = req.body;

    if (!tenantId || !name || !text) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: tenantId, name, text",
      });
    }

    // Verify tenant exists and is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant || tenant.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive shop",
      });
    }

    const review = await prisma.review.create({
      data: {
        tenantId,
        name,
        location: location || "",
        text,
        stars: Math.min(5, Math.max(1, Number(stars) || 5)),
        phone: phone || null,
      },
    });

    return res.status(201).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("Review creation error:", error);
    next(error);
  }
};

/**
 * Get all reviews for a tenant (public - only approved)
 * GET /api/public/reviews/:tenantId
 */
const getPublicReviews = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const reviews = await prisma.review.findMany({
      where: {
        tenantId,
        approved: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: reviews,
      count: reviews.length,
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    next(error);
  }
};

/**
 * Update a review (using phone/session identifier - public)
 * PUT /api/public/reviews/:id
 */
const updateReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, location, text, stars, phone } = req.body;

    // Find the review
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Verify ownership (must provide matching phone)
    if (phone && review.phone !== phone) {
      return res.status(403).json({ success: false, message: "You can only edit your own review" });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(location !== undefined && { location }),
        ...(text && { text }),
        ...(stars && { stars: Math.min(5, Math.max(1, Number(stars))) }),
      },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Review update error:", error);
    next(error);
  }
};

/**
 * Delete a review (using phone/session identifier - public)
 * DELETE /api/public/reviews/:id
 */
const deleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phone } = req.body;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    // Verify ownership
    if (phone && review.phone !== phone) {
      return res.status(403).json({ success: false, message: "You can only delete your own review" });
    }

    await prisma.review.delete({ where: { id } });

    return res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Review delete error:", error);
    next(error);
  }
};

// ── Admin endpoints (auth required) ─────────────────────────────

/**
 * Get ALL reviews for admin dashboard
 * GET /api/admin/reviews/:tenantId
 */
const getAdminReviews = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { approved, page = 1, limit = 50 } = req.query;

    const where = { tenantId };
    if (approved === "true") where.approved = true;
    else if (approved === "false") where.approved = false;

    const total = await prisma.review.count({ where });
    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    return res.json({
      success: true,
      data: reviews,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("Get admin reviews error:", error);
    next(error);
  }
};

/**
 * Admin toggle review approval
 * PATCH /api/admin/reviews/:id/toggle-approval
 */
const toggleReviewApproval = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: { approved: !review.approved },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Toggle review approval error:", error);
    next(error);
  }
};

/**
 * Admin delete any review
 * DELETE /api/admin/reviews/:id
 */
const adminDeleteReview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    await prisma.review.delete({ where: { id } });

    return res.json({
      success: true,
      message: "Review deleted by admin",
    });
  } catch (error) {
    console.error("Admin review delete error:", error);
    next(error);
  }
};

module.exports = {
  createReview,
  getPublicReviews,
  updateReview,
  deleteReview,
  getAdminReviews,
  toggleReviewApproval,
  adminDeleteReview,
};