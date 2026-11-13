const prisma = require('../models');
const {
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
} = require('../utils/steadfastService');

/**
 * Helper: Get tenant's Steadfast credentials or throw
 */
function getCredentials(tenant) {
  if (!tenant.steadfastApiKey || !tenant.steadfastSecretKey) {
    throw new Error('Steadfast Courier API credentials not configured. Please set your API Key and Secret Key in settings.');
  }
  return {
    apiKey: tenant.steadfastApiKey,
    secretKey: tenant.steadfastSecretKey,
  };
}

/**
 * Send a single order to Steadfast Courier
 */
exports.sendToSteadfast = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { orderId } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    // Build item description from order items
    const itemDescriptions = order.items.map(item => {
      return `${item.variant.product.name} x ${item.quantity}`;
    }).join(', ');

    const orderData = {
      invoice: order.orderNumber,
      recipient_name: order.customerName,
      recipient_phone: order.customerPhone,
      recipient_address: order.customerAddress || '',
      recipient_email: order.customerEmail || undefined,
      cod_amount: order.paymentMethod === 'CASH_ON_DELIVERY' ? order.total : 0,
      note: order.notes || undefined,
      item_description: itemDescriptions,
      total_lot: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
    };

    const result = await createOrder(apiKey, secretKey, orderData);

    // If successful, update the order with delivery tracking info
    if (result.status === 200 && result.consignment) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryPartner: 'steadfast',
          deliveryTrackingId: result.consignment.tracking_code || String(result.consignment.consignment_id),
        },
      });
    }

    res.json({
      success: true,
      message: 'Order sent to Steadfast Courier successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk send orders to Steadfast Courier
 */
exports.bulkSendToSteadfast = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderIds array is required' });
    }

    if (orderIds.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 orders allowed per bulk request' });
    }

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, tenantId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'No orders found' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const ordersData = orders.map(order => {
      const itemDescriptions = order.items.map(item => {
        return `${item.variant.product.name} x ${item.quantity}`;
      }).join(', ');

      return {
        invoice: order.orderNumber,
        recipient_name: order.customerName,
        recipient_phone: order.customerPhone,
        recipient_address: order.customerAddress || '',
        recipient_email: order.customerEmail || undefined,
        cod_amount: order.paymentMethod === 'CASH_ON_DELIVERY' ? order.total : 0,
        note: order.notes || undefined,
        item_description: itemDescriptions,
        total_lot: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
      };
    });

    const result = await bulkCreateOrders(apiKey, secretKey, ordersData);

    // Update orders with tracking info if successful
    if (Array.isArray(result)) {
      for (const item of result) {
        if (item.status === 'success' && item.consignment_id) {
          await prisma.order.updateMany({
            where: { tenantId, orderNumber: item.invoice },
            data: {
              deliveryPartner: 'steadfast',
              deliveryTrackingId: item.tracking_code || String(item.consignment_id),
            },
          });
        }
      }
    }

    res.json({
      success: true,
      message: 'Bulk orders sent to Steadfast Courier',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check delivery status by tracking code
 */
exports.checkDeliveryStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { trackingCode } = req.params;

    const order = await prisma.order.findFirst({
      where: { deliveryTrackingId: trackingCode, tenantId },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order with this tracking code not found' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const status = await getStatusByTrackingCode(apiKey, secretKey, trackingCode);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check delivery status by consignment ID
 */
exports.checkStatusByConsignmentId = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { consignmentId } = req.params;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const status = await getStatusByConsignmentId(apiKey, secretKey, parseInt(consignmentId));

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check delivery status by invoice
 */
exports.checkStatusByInvoice = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { invoice } = req.params;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const status = await getStatusByInvoice(apiKey, secretKey, invoice);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Steadfast account balance
 */
exports.getAccountBalance = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const balance = await getBalance(apiKey, secretKey);

    res.json({
      success: true,
      data: balance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Steadfast return requests
 */
exports.getReturnRequests = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const returns = await getReturnRequests(apiKey, secretKey);

    res.json({
      success: true,
      data: returns,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single return request
 */
exports.getReturnRequest = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const returnData = await getReturnRequest(apiKey, secretKey, parseInt(id));

    res.json({
      success: true,
      data: returnData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a return request on Steadfast
 */
exports.createReturnRequest = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { consignment_id, reason } = req.body;

    if (!consignment_id) {
      return res.status(400).json({ success: false, message: 'consignment_id (or invoice/tracking_code) is required' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const result = await createReturnRequest(apiKey, secretKey, {
      consignment_id,
      reason: reason || undefined,
    });

    res.json({
      success: true,
      message: 'Return request created successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payments list
 */
exports.getPayments = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const payments = await getPayments(apiKey, secretKey);

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single payment with consignments
 */
exports.getPaymentWithConsignments = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { paymentId } = req.params;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const payment = await getPaymentWithConsignments(apiKey, secretKey, parseInt(paymentId));

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get police stations
 */
exports.getPoliceStations = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const { apiKey, secretKey } = getCredentials(tenant);

    const stations = await getPoliceStations(apiKey, secretKey);

    res.json({
      success: true,
      data: stations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Test Steadfast API connection
 */
exports.testConnection = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { apiKey, secretKey } = req.body;

    if (!apiKey || !secretKey) {
      return res.status(400).json({ success: false, message: 'API Key and Secret Key are required' });
    }

    // Test by checking balance
    const balance = await getBalance(apiKey, secretKey);

    res.json({
      success: true,
      message: 'Steadfast Courier API connection successful',
      data: balance,
    });
  } catch (error) {
    res.json({
      success: false,
      message: error.message || 'Failed to connect to Steadfast Courier API',
    });
  }
};