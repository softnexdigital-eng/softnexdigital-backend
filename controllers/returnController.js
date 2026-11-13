const prisma = require("../models");
const { sendRefundEmail } = require("../utils/emailService");
const { applyMovementInTransaction, resolveBranchForUser } = require("../services/inventoryService");

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

    const updated = await prisma.$transaction(async (tx) => {
      const returnReq = await tx.returnRequest.findFirst({
        where: { id, order: { tenantId } },
        include: { order: { include: { items: true } } },
      });
      if (!returnReq) {
        const error = new Error("Return request not found");
        error.status = 404;
        throw error;
      }

      if (status === "APPROVED" && returnReq.status !== "APPROVED") {
        const changed = await tx.returnRequest.updateMany({
          where: { id, status: returnReq.status },
          data: { status, adminNote },
        });
        if (changed.count !== 1) {
          const error = new Error("Return status changed concurrently");
          error.status = 409;
          throw error;
        }

        const damaged = ["damaged", "broken", "defective", "spoiled", "damage"]
          .some((term) => returnReq.reason.toLowerCase().includes(term));
        const stockWasDeducted = [
          "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED",
          "OUT_FOR_DELIVERY", "DELIVEred", "RETURNED",
        ].includes(returnReq.order.status);
        if (!damaged && stockWasDeducted) {
          const branch = await resolveBranchForUser(tx, {
            tenantId,
            user: req.user,
            branchId: returnReq.order.branchId || req.headers["x-branch-id"],
          });
          const items = returnReq.orderItemId
            ? returnReq.order.items.filter((item) => item.id === returnReq.orderItemId)
            : returnReq.order.items;
          for (const item of items) {
            await applyMovementInTransaction(tx, {
              tenantId,
              branchId: branch.id,
              variantId: item.variantId,
              type: "RETURN",
              quantity: Number(item.quantity),
              idempotencyKey: `return:${returnReq.id}:item:${item.id}`,
              orderId: returnReq.orderId,
              actorId: req.user.id,
              referenceType: "RETURN",
              referenceId: returnReq.id,
              note: "Approved customer return",
            });
          }
        }
        return tx.returnRequest.findUnique({ where: { id } });
      }

      return tx.returnRequest.update({
        where: { id },
        data: { status, adminNote },
      });
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