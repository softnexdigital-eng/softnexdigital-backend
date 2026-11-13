const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');

const router = express.Router();

router.use(protect);

router.post('/validate', validateCoupon);

router.route('/')
  .get(listCoupons)
  .post(createCoupon);

router.route('/:id')
  .get(getCoupon)
  .put(updateCoupon)
  .patch(toggleCouponStatus)
  .delete(deleteCoupon);

module.exports = router;