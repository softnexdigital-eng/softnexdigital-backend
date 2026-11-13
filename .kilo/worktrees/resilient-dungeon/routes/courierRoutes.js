const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  listCouriers,
  getCourier,
  createCourier,
  updateCourier,
  deleteCourier,
  toggleCourierStatus,
} = require('../controllers/courierController');

// All routes require authentication
router.use(protect);

// CRUD operations
router.get('/', listCouriers);
router.get('/:id', getCourier);
router.post('/', createCourier);
router.put('/:id', updateCourier);
router.delete('/:id', deleteCourier);

// Toggle active status
router.patch('/:id/toggle', toggleCourierStatus);

module.exports = router;