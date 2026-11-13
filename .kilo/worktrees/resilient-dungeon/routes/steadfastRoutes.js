const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  sendToSteadfast,
  bulkSendToSteadfast,
  checkDeliveryStatus,
  checkStatusByConsignmentId,
  checkStatusByInvoice,
  getAccountBalance,
  getReturnRequests,
  getReturnRequest,
  createReturnRequest,
  getPayments,
  getPaymentWithConsignments,
  getPoliceStations,
  testConnection,
} = require('../controllers/steadfastController');

/**
 * Steadfast Courier Routes
 * Base path: /api/steadfast
 */

// Test API connection
router.post('/test-connection', protect, testConnection);

// Send order to Steadfast
router.post('/send-order', protect, sendToSteadfast);

// Bulk send orders to Steadfast
router.post('/bulk-send', protect, bulkSendToSteadfast);

// Check delivery status
router.get('/status/tracking/:trackingCode', protect, checkDeliveryStatus);
router.get('/status/consignment/:consignmentId', protect, checkStatusByConsignmentId);
router.get('/status/invoice/:invoice', protect, checkStatusByInvoice);

// Account balance
router.get('/balance', protect, getAccountBalance);

// Return requests
router.get('/returns', protect, getReturnRequests);
router.get('/returns/:id', protect, getReturnRequest);
router.post('/returns', protect, createReturnRequest);

// Payments
router.get('/payments', protect, getPayments);
router.get('/payments/:paymentId', protect, getPaymentWithConsignments);

// Police stations
router.get('/police-stations', protect, getPoliceStations);

module.exports = router;