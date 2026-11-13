const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
} = require('../controllers/addressController');

const router = express.Router();

router.use(protect);

router.get('/customer/:customerId', listAddresses);

router.route('/')
  .post(createAddress);

router.route('/:id')
  .get(getAddress)
  .put(updateAddress)
  .delete(deleteAddress);

module.exports = router;