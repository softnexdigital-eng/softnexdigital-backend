const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  listBrands,
  getBrand,
  createBrand,
  updateBrand,
  deleteBrand,
} = require('../controllers/brandController');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(listBrands)
  .post(createBrand);

router.route('/:id')
  .get(getBrand)
  .put(updateBrand)
  .delete(deleteBrand);

module.exports = router;