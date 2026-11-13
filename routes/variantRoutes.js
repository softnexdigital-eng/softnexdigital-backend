const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireBranchAccess } = require('../middleware/branchAuthorization');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const {
  getVariants,
  addVariant,
  bulkGenerateVariants,
  bulkUploadCSV,
  updateVariant,
  deleteVariant,
  adjustStock,
  getLowStock,
  matchVariant,
} = require('../controllers/variantController');

const router = express.Router();

// Public/utility: exact variant match (tenant verified via product/variant)
router.post('/match', matchVariant);

router.use(protect);

router.route('/')
  .get(getVariants)
  .post(addVariant);

// Get variants by supplier
router.get('/by-supplier', getVariants);

router.post('/bulk/generate', bulkGenerateVariants);
router.post('/bulk/upload', upload.single('file'), bulkUploadCSV);
router.get('/low-stock', getLowStock);
router.put('/:id', updateVariant);
router.delete('/:id', deleteVariant);
router.post('/:id/adjust-stock', requireBranchAccess(), adjustStock);

module.exports = router;