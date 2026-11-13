const express = require("express");
const { createPublicOrder, getPublicOrderTracking, trackPageView, getPageStats, trackIncompleteCheckout, listPublicProducts, getPublicProductBySlug, listPublicCategories, listPublicBrands, addToPublicWishlist, removeFromPublicWishlist, getPublicWishlist, addToCartPublic, removeFromCartPublic, updateCartPublic, getCartPublic } = require("../controllers/publicController");
const { saveIncompleteCheckout } = require("../controllers/incompleteCheckoutController");
const { getBanners: getPublicBanners } = require("../controllers/bannerController");
const { validateCouponPublic } = require("../controllers/couponController");
const { getPublicLandingPage, getPublicLandingTheme } = require("../controllers/landingPageController");
const { listPublicStores } = require("../controllers/publicStoreController");
const { createReview, getPublicReviews, updateReview, deleteReview } = require("../controllers/reviewController");
const { rateLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// E-commerce storefront endpoints (public)
router.get("/products", listPublicProducts);
router.get("/products/slug/:slug", getPublicProductBySlug);
router.get("/categories", listPublicCategories);
router.get("/brands", listPublicBrands);

// Existing order endpoint
router.post("/orders", rateLimiter, createPublicOrder);
router.get("/orders/track/:orderNumber", rateLimiter, getPublicOrderTracking);
router.post("/incomplete-checkout", rateLimiter, trackIncompleteCheckout);
router.post("/incomplete-checkout/save", saveIncompleteCheckout);

// Coupon validation (public - no auth required)
router.post("/coupon/validate", validateCouponPublic);

// Cart endpoints (guest users with sessionId)
router.post("/cart/add", addToCartPublic);
router.delete("/cart/remove/:variantId", removeFromCartPublic);
router.put("/cart/update", updateCartPublic);
router.get("/cart", getCartPublic);

// Wishlist endpoints (guest users with sessionId)
router.post("/wishlist/add", addToPublicWishlist);
router.delete("/wishlist/remove/:variantId", removeFromPublicWishlist);
router.get("/wishlist", getPublicWishlist);

// Landing page endpoints
router.get("/stores", listPublicStores);
router.get("/landing-page/:slug", getPublicLandingPage);
router.get("/banners/:tenantId", getPublicBanners);
router.post("/page-view/:slug", trackPageView);
router.get("/page-stats/:slug", getPageStats);
router.get("/landing-theme/:slug", getPublicLandingTheme);

// Review routes (public)
router.post("/reviews", rateLimiter, createReview);
router.get("/reviews/:tenantId", getPublicReviews);
router.put("/reviews/:id", rateLimiter, updateReview);
router.delete("/reviews/:id", rateLimiter, deleteReview);

module.exports = router;
