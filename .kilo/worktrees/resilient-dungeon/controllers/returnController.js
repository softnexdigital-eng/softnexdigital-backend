const prisma = require("../models");
const { sendRefundEmail } = require("../utils/emailService");

// Helper to find order by number and email (for public request)
async function findOrderByNumberAndEmail(orderNumber, email) {
  return prisma.order.findFirst({
    where: {
      orderNumber,
      customerEmail: email,
    },
    include: { items: true },
  });
}

// Public: Create return request
exports.createReturnRequest = async (req, res, next) => {
  try {
    const { orderNumber, customerEmail, customerPhone, reason, description, requestedAmount, orderItemId } = req.body;

    if (!orderNumber || !customerEmail || !reason) {
      return res.status(400).json({ success: false, message: "orderNumber, customerEmail, reason are required" });
    }

    // Try to find order by number + email, or number + phone, or just number (for admin requests)
    let order = await findOrderByNumberAndEmail(orderNumber, customerEmail);
    if (!order && customerPhone) {
      order = await prisma.order.findFirst({
        where: { orderNumber, customerPhone },
        include: { items: true },
      });
    }
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found with given details" });
    }

    // Allow return for DELIVEred or CONFIRMED or PENDING orders
    if (!["DELIVEred", "CONFIRMED", "PENDING"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Return not allowed for this order status" });
    }

    // If orderItemId provided, ensure it belongs to this order
    if (orderItemId) {
      const orderItem = await prisma.orderItem.findFirst({
        where: { id: orderItemId, orderId: order.id },
      });
      if (!orderItem) {
        return res.status(400).json({ success: false, message: "Order item not found in this order" });
      }
    }

    const returnRequest = await prisma.returnRequest.create({
      data: {
        orderId: order.id,
        orderItemId: orderItemId || null,
        customerName: order.customerName,
        customerPhone: customerPhone || order.customerPhone,
        customerEmail: order.customerEmail,
        reason,
        description,
        requestedAmount: requestedAmount ? parseFloat(requestedAmount) : null,
        status: "PENDING_APPROVAL",
      },
    });

    res.status(201).json({ success: true, data: returnRequest });
  } catch (error) {
    next(error);
  }
};

// Admin: List all return requests (with filters)
exports.listReturns = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const where = { order: { tenantId } };
    if (status) where.status = status;

    const returns = await prisma.returnRequest.findMany({
      where,
      include: { order: true, refund: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.returnRequest.count({ where });
    res.json({ success: true, data: { returns, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

/// Admin: Update return status (approve/reject) – with conditional restock
exports.updateReturnStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status, adminNote } = req.body;

    const returnReq = await prisma.returnRequest.findFirst({
      where: { id, order: { tenantId } },
      include: { order: { include: { items: true } }, orderItem: true },
    });
    if (!returnReq) return res.status(404).json({ success: false, message: "Return request not found" });

    // If approving and not already approved
    if (status === "APPROVED" && returnReq.status !== "APPROVED") {
      // ✅ NEW: Only restock if the reason is NOT damage-related
      const damageReasons = ['damaged', 'broken', 'defective', 'spoiled', 'damage'];
      const shouldRestock = !damageReasons.includes(returnReq.reason.toLowerCase());

      if (shouldRestock) {
        // If specific order item, restock that variant
        if (returnReq.orderItemId) {
          const orderItem = await prisma.orderItem.findUnique({
            where: { id: returnReq.orderItemId },
          });
          if (orderItem) {
            await prisma.$transaction([
              prisma.variant.update({
                where: { id: orderItem.variantId },
                data: { stock: { increment: orderItem.quantity } },
              }),
              prisma.inventoryLog.create({
                data: {
                  variantId: orderItem.variantId,
                  quantity: orderItem.quantity,
                  reason: "return_restock",
                  orderId: returnReq.orderId,
                },
              }),
            ]);
          }
        } else {
          // Restock all items in the order
          for (const item of returnReq.order.items) {
            await prisma.$transaction([
              prisma.variant.update({
                where: { id: item.variantId },
                data: { stock: { increment: item.quantity } },
              }),
              prisma.inventoryLog.create({
                data: {
                  variantId: item.variantId,
                  quantity: item.quantity,
                  reason: "return_restock",
                  orderId: returnReq.orderId,
                },
              }),
            ]);
          }
        }
      } else {
        // For damaged returns, create an inventory log but do NOT increase stock
        // (optional: log as damaged return without restock)
        if (returnReq.orderItemId) {
          const orderItem = await prisma.orderItem.findUnique({
            where: { id: returnReq.orderItemId },
          });
          if (orderItem) {
            await prisma.inventoryLog.create({
              data: {
                variantId: orderItem.variantId,
                quantity: 0, // no stock change
                reason: "damaged_return",
                orderId: returnReq.orderId,
              },
            });
          }
        } else {
          for (const item of returnReq.order.items) {
            await prisma.inventoryLog.create({
              data: {
                variantId: item.variantId,
                quantity: 0,
                reason: "damaged_return",
                orderId: returnReq.orderId,
              },
            });
          }
        }
        console.log(`Return approved but NOT restocked (reason: ${returnReq.reason})`);
      }
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: { status, adminNote },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Admin: Create refund for an approved return
exports.createRefund = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params; // returnRequestId
    const { amount, method, transactionId, notes } = req.body;

    const returnReq = await prisma.returnRequest.findFirst({
      where: { id, order: { tenantId } },
      include: {
        order: {
          include: {
            customer: true, // include customer for totalSpent adjustment
          },
        },
      },
    });
    if (!returnReq) return res.status(404).json({ success: false, message: "Return request not found" });
    if (returnReq.status !== "APPROVED") {
      return res.status(400).json({ success: false, message: "Refund only allowed for approved returns" });
    }

    const refundAmount = amount || returnReq.requestedAmount || 0;
    const refund = await prisma.refund.create({
      data: {
        returnRequestId: id,
        amount: refundAmount,
        method,
        transactionId,
        notes,
        processedBy: req.user.id,
        status: "COMPLETED",
      },
    });

    // Update return status to REFUNDED
    await prisma.returnRequest.update({
      where: { id },
      data: { status: "REFUNDED" },
    });

    // Adjust customer totalSpent (deduct refund amount)
    const order = returnReq.order;
    if (order.customerId && order.customer) {
      await prisma.customer.update({
        where: { id: order.customerId },
        data: {
          totalSpent: { decrement: refundAmount },
        },
      });
    }

    // Send refund email to customer (non-blocking)
    if (order.customerEmail) {
      sendRefundEmail(order.customerEmail, order.orderNumber, refundAmount).catch(console.error);
    }

    res.status(201).json({ success: true, data: refund });
  } catch (error) {
    next(error);
  }
};

// Public: Track return status by order number and email
exports.trackReturn = async (req, res, next) => {
  try {
    const { orderNumber, email } = req.query;
    if (!orderNumber || !email) {
      return res.status(400).json({ success: false, message: "orderNumber and email required" });
    }
    const returnReq = await prisma.returnRequest.findFirst({
      where: {
        order: { orderNumber },
        customerEmail: email,
      },
      include: { refund: true },
    });
    if (!returnReq) {
      return res.status(404).json({ success: false, message: "No return request found" });
    }
    res.json({ success: true, data: returnReq });
  } catch (error) {
    next(error);
  }
};