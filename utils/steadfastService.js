const axios = require('axios');

const STEADFAST_BASE_URL = 'https://portal.packzy.com/api/v1';

/**
 * Create an axios instance with Steadfast API credentials
 */
function createClient(apiKey, secretKey) {
  return axios.create({
    baseURL: STEADFAST_BASE_URL,
    headers: {
      'Api-Key': apiKey,
      'Secret-Key': secretKey,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Place a single order to Steadfast Courier
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {Object} orderData - Order data
 * @param {string} orderData.invoice - Unique invoice number
 * @param {string} orderData.recipient_name - Recipient name
 * @param {string} orderData.recipient_phone - Recipient phone (11 digits)
 * @param {string} orderData.recipient_address - Recipient address
 * @param {number} orderData.cod_amount - Cash on delivery amount
 * @param {string} [orderData.note] - Delivery note
 * @param {string} [orderData.recipient_email] - Recipient email
 * @param {string} [orderData.alternative_phone] - Alternative phone
 * @param {string} [orderData.item_description] - Item description
 * @param {number} [orderData.total_lot] - Total lot
 * @param {number} [orderData.delivery_type] - 0=home, 1=hub pickup
 * @returns {Promise<Object>}
 */
async function createOrder(apiKey, secretKey, orderData) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.post('/create_order', orderData);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast create order failed: ${errorMessage}`);
  }
}

/**
 * Bulk create orders to Steadfast Courier
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {Array} ordersData - Array of order objects (max 500)
 * @returns {Promise<Array>}
 */
async function bulkCreateOrders(apiKey, secretKey, ordersData) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.post('/create_order/bulk-order', {
      data: ordersData,
    });
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast bulk create failed: ${errorMessage}`);
  }
}

/**
 * Check delivery status by consignment ID
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {number} consignmentId - Consignment ID
 * @returns {Promise<Object>}
 */
async function getStatusByConsignmentId(apiKey, secretKey, consignmentId) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get(`/status_by_cid/${consignmentId}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast status check failed: ${errorMessage}`);
  }
}

/**
 * Check delivery status by invoice ID
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {string} invoice - Invoice number
 * @returns {Promise<Object>}
 */
async function getStatusByInvoice(apiKey, secretKey, invoice) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get(`/status_by_invoice/${invoice}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast status check failed: ${errorMessage}`);
  }
}

/**
 * Check delivery status by tracking code
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {string} trackingCode - Tracking code
 * @returns {Promise<Object>}
 */
async function getStatusByTrackingCode(apiKey, secretKey, trackingCode) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get(`/status_by_trackingcode/${trackingCode}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast status check failed: ${errorMessage}`);
  }
}

/**
 * Check current balance
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @returns {Promise<Object>}
 */
async function getBalance(apiKey, secretKey) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get('/get_balance');
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast balance check failed: ${errorMessage}`);
  }
}

/**
 * Create a return request
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {Object} returnData
 * @param {string|number} returnData.consignment_id - Consignment ID or invoice or tracking code
 * @param {string} [returnData.reason] - Return reason
 * @returns {Promise<Object>}
 */
async function createReturnRequest(apiKey, secretKey, returnData) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.post('/create_return_request', returnData);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast return request failed: ${errorMessage}`);
  }
}

/**
 * Get a single return request by ID
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {number} id - Return request ID
 * @returns {Promise<Object>}
 */
async function getReturnRequest(apiKey, secretKey, id) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get(`/get_return_request/${id}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast get return request failed: ${errorMessage}`);
  }
}

/**
 * Get all return requests
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @returns {Promise<Object>}
 */
async function getReturnRequests(apiKey, secretKey) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get('/get_return_requests');
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast get return requests failed: ${errorMessage}`);
  }
}

/**
 * Get payments list
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @returns {Promise<Object>}
 */
async function getPayments(apiKey, secretKey) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get('/payments');
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast get payments failed: ${errorMessage}`);
  }
}

/**
 * Get single payment with consignments
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @param {number} paymentId - Payment ID
 * @returns {Promise<Object>}
 */
async function getPaymentWithConsignments(apiKey, secretKey, paymentId) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get(`/payments/${paymentId}`);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast get payment failed: ${errorMessage}`);
  }
}

/**
 * Get police stations list
 * @param {string} apiKey - Steadfast API Key
 * @param {string} secretKey - Steadfast Secret Key
 * @returns {Promise<Object>}
 */
async function getPoliceStations(apiKey, secretKey) {
  try {
    const client = createClient(apiKey, secretKey);
    const response = await client.get('/police_stations');
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Steadfast get police stations failed: ${errorMessage}`);
  }
}

module.exports = {
  createOrder,
  bulkCreateOrders,
  getStatusByConsignmentId,
  getStatusByInvoice,
  getStatusByTrackingCode,
  getBalance,
  createReturnRequest,
  getReturnRequest,
  getReturnRequests,
  getPayments,
  getPaymentWithConsignments,
  getPoliceStations,
};