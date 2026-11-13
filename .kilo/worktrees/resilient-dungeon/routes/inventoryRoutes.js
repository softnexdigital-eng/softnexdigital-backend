const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getInventoryLogs, getStockReport } = require('../controllers/inventoryController');

const router = express.Router();

router.use(protect);

router.get('/logs', getInventoryLogs);
router.get('/report', getStockReport);

module.exports = router;