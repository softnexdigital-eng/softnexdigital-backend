const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireBranchAccess, requireBranchPermission } = require('../middleware/branchAuthorization');
const { getInventoryLogs, getStockReport } = require('../controllers/inventoryController');
const {
  createAdjustment,
  listAdjustments,
  listBalances,
  listLowStockBalances,
  listMovements,
  reverseAdjustment,
  updateThresholds,
} = require('../controllers/inventoryOperationsController');

const router = express.Router();

router.use(protect);

router.get('/balances', requireBranchAccess({ required: true }), listBalances);
router.get('/alerts/low-stock', requireBranchAccess({ required: true }), listLowStockBalances);
router.patch('/balances/:variantId/thresholds', requireBranchPermission('inventory.adjust'), updateThresholds);
router.get('/movements', requireBranchAccess({ required: true }), listMovements);
router.get('/adjustments', requireBranchAccess({ required: true }), listAdjustments);
router.post('/adjustments', requireBranchPermission('inventory.adjust'), createAdjustment);
router.post('/adjustments/:adjustmentId/reverse', requireBranchPermission('inventory.adjust'), reverseAdjustment);
router.get('/logs', getInventoryLogs);
router.get('/report', getStockReport);

module.exports = router;