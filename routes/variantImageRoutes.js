const express = require('express');
const router = express.Router();
const variantImageController = require('../controllers/variantImageController');
const { protect } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

router.get('/', variantImageController.getVariantImages);
router.post('/', variantImageController.addVariantImage);
router.put('/:id', variantImageController.updateVariantImage);
router.delete('/:id', variantImageController.deleteVariantImage);

module.exports = router;