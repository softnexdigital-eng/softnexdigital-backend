const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  clearCart,
} = require('../controllers/cartController');

const router = express.Router();

router.use(protect);

router.get('/', getCart);
router.post('/items', addItem);
router.put('/items/:itemId', updateItemQuantity);
router.delete('/items/:itemId', removeItem);
router.delete('/', clearCart);

module.exports = router;