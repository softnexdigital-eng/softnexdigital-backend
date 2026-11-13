const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireBranchAccess } = require('../middleware/branchAuthorization');
const {
  listOrders,
  getOrder,
  createOrder,
  checkoutFromCart,
  updateStatus,
  bulkAction,
  addComment,
  downloadInvoice,
  sendInvoice,
  deleteOrder,
} = require('../controllers/orderController');

const router = express.Router();

router.use(protect);

// Checkout from cart
router.post('/checkout', requireBranchAccess(), checkoutFromCart);

// Bulk action
router.post('/bulk', requireBranchAccess(), bulkAction);

// Invoice
router.get('/:id/invoice', downloadInvoice);
router.post('/:id/send-invoice', sendInvoice);

// Comments
router.post('/:id/comment', addComment);

// CRUD
router.route('/')
  .get(listOrders)
  .post(requireBranchAccess(), createOrder);

router.route('/:id')
  .get(getOrder)
  .put(requireBranchAccess(), updateStatus)
  .delete(deleteOrder);

module.exports = router;