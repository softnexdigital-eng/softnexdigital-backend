const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listWishlist,
  addToWishlist,
  removeFromWishlist,
  migrateWishlistToUser,
  addToPublicWishlist,
  removeFromPublicWishlist,
  getPublicWishlist,
} = require('../controllers/wishlistController');

const router = express.Router();

// ════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no authentication required)
// ════════════════════════════════════════════════════════════
router.post('/public/add', addToPublicWishlist);
router.delete('/public/remove/:variantId', removeFromPublicWishlist);
router.get('/public/:sessionId', getPublicWishlist);

// ════════════════════════════════════════════════════════════
// PROTECTED ROUTES (authentication required)
// ════════════════════════════════════════════════════════════
router.use(protect);

router.route('/')
  .get(listWishlist)
  .post(addToWishlist);

router.delete('/:id', removeFromWishlist);
router.post('/migrate', migrateWishlistToUser);

module.exports = router;