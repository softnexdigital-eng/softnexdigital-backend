const express = require('express');
const router = express.Router();
const {
  handleSteadfastWebhook,
  handleGenericWebhook,
  listWebhookLogs,
} = require('../controllers/webhookController');

// Public webhook endpoint (no auth required - uses signature verification)
router.post('/steadfast', handleSteadfastWebhook);

// Generic webhook endpoint for any courier
router.post('/courier/:courierId', handleGenericWebhook);

// Admin: Get webhook logs (requires auth)
const { protect } = require('../middleware/authMiddleware');
router.use(protect);
router.get('/logs', listWebhookLogs);

module.exports = router;