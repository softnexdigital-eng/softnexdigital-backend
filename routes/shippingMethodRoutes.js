const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listShippingMethods,
  getShippingMethod,
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
  calculateShipping,
} = require('../controllers/shippingMethodController');

const router = express.Router();

router.use(protect);

router.get('/calculate/:methodId', calculateShipping);

router.route('/')
  .get(listShippingMethods)
  .post(createShippingMethod);

router.route('/:id')
  .get(getShippingMethod)
  .put(updateShippingMethod)
  .delete(deleteShippingMethod);

module.exports = router;