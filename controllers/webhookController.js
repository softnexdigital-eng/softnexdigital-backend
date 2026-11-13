const prisma = require("../models");
const { applyMovementInTransaction } = require("../services/inventoryService");
const { verifyWebhookSignature } = require("../utils/steadfastService");

const STOCK_DEDUCTED_STATUSES = [
  "CONFIRMED",
  "PROCESSING",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVEred",
  "RETURNED",
];

// Steadfast webhook handler for delivery status updates
exports.handleSteadfastWebhook = async (req, res, next) => {
  try {
    // Verify webhook signature using Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Missing Authorization header' });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Find courier with matching API key
    const courier = await prisma.courier.findFirst({
      where: { apiKey, isActive: true },
    });

    if (!courier) {
      return res.status(401).json({ status: 'error', message: 'Invalid API key' });
    }

    const { notification_type, consignment_id, invoice, cod_amount, status, delivery_charge, tracking_message, updated_at } = req.body;

    if (!notification_type) {
      return res.status(400).json({ status: 'error', message: 'Missing notification_type' });
    }

    // Handle different notification types
    if (notification_type === 'delivery_status' || notification_type === 'tracking_update') {
      if (!consignment_id && !invoice) {
        return res.status(400).json({ status: 'error', message: 'Invalid consignment ID or invoice.' });
      }

      // Find the order by consignment ID or invoice number
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { courierConsignmentId: String(consignment_id) },
            { orderNumber: invoice },
          ],
        },
        include: { items: { include: { variant: true } } },
      });

      if (!order) {
        console.log('Webhook received for unknown order:', { consignment_id, invoice, status });
        // Still return success - don't fail the webhook
        return res.json({ status: 'success', message: 'Webhook received successfully.' });
      }

      // Map Steadfast status to our order status
      const statusMap = {
        'pending': 'PENDING',
        'delivered': 'DELIVEred',
        'partial_delivered': 'PARTIALLY_DELIVEred',
        'cancelled': 'CANCELLED',
        'unknown': 'UNKNOWN',
      };

      const newStatus = statusMap[status?.toLowerCase()] || order.status;
      const isDelivered = newStatus === 'DELIVEred';
      const isCancelled = newStatus === 'CANCELLED';
      const isShipped = ['SHIPPED', 'OUT_FOR_DELIVERY', 'PROCESSING'].includes(newStatus);

      // Build update data
      const updateData = {
        courierStatus: status,
        deliveryStatus: tracking_message || status,
        status: newStatus,
      };

      if (isShipped && !order.shippedAt) {
        updateData.shippedAt = new Date();
      }
      if (isDelivered && !order.deliveredAt) {
        updateData.deliveredAt = new Date();
      }
      if (!order.deliveryPartner) {
        updateData.deliveryPartner = 'steadfast';
      }
      if (!order.courierConsignmentId && consignment_id) {
        updateData.courierConsignmentId = String(consignment_id);
      }

      // Update order
      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      // Create webhook log
      await prisma.webhookLog.create({
        data: {
          tenantId: order.tenantId,
          courierId: courier.id,
          payload: req.body,
          headers: Object.fromEntries(req.headers),
        },
      });

      // If cancelled, create return record automatically
      if (isCancelled) {
        await prisma.$transaction(async (tx) => {
          const existingReturn = await tx.returnRequest.findFirst({
            where: { orderId: order.id },
          });
          if (existingReturn) return;

          await tx.returnRequest.create({
            data: {
              orderId: order.id,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              customerEmail: order.customerEmail || '',
              reason: 'courier_cancelled',
              description: tracking_message || 'Cancelled by courier',
              status: 'PENDING_APPROVAL',
            },
          });

          if (order.items?.length && STOCK_DEDUCTED_STATUSES.includes(order.status)) {
            const branch = order.branchId
              ? await tx.branch.findFirst({ where: { id: order.branchId, tenantId: order.tenantId }, select: { id: true } })
              : await tx.branch.findFirst({ where: { tenantId: order.tenantId, isDefault: true, isActive: true }, select: { id: true } });
            if (!branch) throw new Error('No authorized branch is available for courier return stock');
            for (const item of order.items) {
              await applyMovementInTransaction(tx, {
                tenantId: order.tenantId,
                branchId: branch.id,
                variantId: item.variantId,
                type: 'RETURN',
                quantity: Number(item.quantity),
                idempotencyKey: `courier-return:${order.id}:item:${item.id}`,
                orderId: order.id,
                referenceType: 'COURIER_RETURN',
                referenceId: order.id,
                note: 'Courier cancelled shipment',
              });
            }
          }
        });
      }

      console.log(`Webhook processed: Order ${order.orderNumber} - ${notification_type} - ${newStatus}`);

      return res.json({ status: 'success', message: 'Webhook received successfully.' });
    }

    // Unknown notification type
    return res.json({ status: 'success', message: 'Webhook received but not processed.' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ status: 'error', message: 'Webhook processing failed' });
  }
};

// Generic webhook endpoint that can be configured per courier
exports.handleGenericWebhook = async (req, res, next) => {
  try {
    const { courierId } = req.params;
    
    // Find courier configuration
    const courier = await prisma.courier.findFirst({
      where: { id: courierId },
    });

    if (!courier) {
      return res.status(404).json({ success: false, message: 'Courier not found' });
    }

    // Store webhook payload for processing
    const webhookLog = await prisma.webhookLog.create({
      data: {
        tenantId: courier.tenantId,
        courierId: courier.id,
        payload: req.body,
        headers: Object.fromEntries(req.headers),
      },
    });

    // TODO: Process webhook based on courier type
    // This is where you'd handle different courier webhook formats

    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
};

// Get webhook logs for a tenant
exports.listWebhookLogs = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const logs = await prisma.webhookLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(String(page)) - 1) * parseInt(String(limit)),
      take: parseInt(String(limit)),
    });

    const total = await prisma.webhookLog.count({ where: { tenantId } });

    res.json({ success: true, data: { logs, total, page, limit } });
  } catch (error) {
    next(error);
  }
};