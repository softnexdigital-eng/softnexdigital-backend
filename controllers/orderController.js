const prisma = require('../models');
const crypto = require('crypto');
const { sendOrderStatusEmail, sendInvoiceToCustomer } = require('../utils/emailService');
const { generateInvoice } = require('../utils/invoiceService');
const { createSuperAdminNotification } = require('../utils/superAdminNotifications');
const {
  applyOrderMovementsInTransaction,
  resolveBranchForUser,
} = require('../services/inventoryService');

// Helper: generate order number
async function generateOrderNumber(tenantId) {
  const updatedTenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderCounter: { increment: 1 } },
  });
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${String(updatedTenant.orderCounter).padStart(4,'0')}-${randomSuffix}`;
}

// Allowed status transitions
const allowedTransitions = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED'],
  PACKED: ['SHIPPED'],
  SHIPPED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVEred', 'RETURNED'],
  DELIVEred: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

// List orders with filters
exports.listOrders = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { status, startDate, endDate, customerPhone, page = 1, limit = 20 } = req.query;
    const where = { tenantId };
    if (status) where.status = status;
    if (customerPhone) where.customerPhone = { contains: customerPhone };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    const orders = await prisma.order.findMany({
      where,
      include: { 
        items: { include: { variant: true } }, 
        statusHistory: true,
        coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
        shippingMethod: { select: { id: true, name: true, price: true } },
        shippingAddress: true,
        billingAddress: true,
        paymentTransactions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.order.count({ where });
    res.json({ success: true, data: { orders, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

// Get single order
exports.getOrder = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: { 
        items: { include: { variant: true } }, 
        statusHistory: true,
        coupon: { select: { id: true, code: true } },
        shippingMethod: { select: { id: true, name: true, price: true } },
        shippingAddress: true,
        billingAddress: true,
        paymentTransactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Create order (admin)
exports.createOrder = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { customerName, customerPhone, customerAddress, customerEmail, items, notes } = req.body;
    // items: [{ variantId, quantity }]
    let subtotal = 0;
    const orderItemsData = [];
    for (const item of items) {
      const variant = await prisma.variant.findFirst({
        where: { id: item.variantId, product: { tenantId } },
      });
      if (!variant) return res.status(400).json({ success: false, message: `Variant ${item.variantId} not found` });
      const price = variant.price;
      const total = price * item.quantity;
      subtotal += total;
      orderItemsData.push({
        variantId: item.variantId,
        skuAtTime: variant.sku,
        attributes: variant.attributes,
        quantity: item.quantity,
        priceAtTime: price,
        total,
      });
    }

    // Get delivery charge from tenant settings
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const deliveryCharge = tenant?.deliveryCharge ? Number(tenant.deliveryCharge) : 0;
    const total = subtotal + deliveryCharge;
    const branch = await resolveBranchForUser(prisma, {
      tenantId,
      user: req.user,
      branchId: req.headers['x-branch-id'],
    });

    const orderNumber = await generateOrderNumber(tenantId);
    const order = await prisma.order.create({
      data: {
        tenantId,
        branchId: branch.id,
        orderNumber,
        customerName,
        customerPhone,
        customerAddress,
        customerEmail,
        status: 'PENDING',
        subtotal,
        deliveryCharge,
        total,
        notes,
        items: { create: orderItemsData },
        statusHistory: { create: { status: 'PENDING', changedBy: req.user.id } },
      },
      include: { items: { include: { variant: true } } },
    });

    await createSuperAdminNotification({
      type: 'NEW_ORDER',
      title: 'New order received',
      message: `Order ${order.orderNumber} was created for ${tenant?.name || 'a store'}.`,
      entityId: order.id,
      tenantId,
    });

    // Send invoice email to customer (non-blocking)
    if (customerEmail) {
      try {
        const fullOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: { items: { include: { variant: true } }, tenant: true },
        });
        await sendInvoiceToCustomer(customerEmail, fullOrder, fullOrder.tenant);
      } catch (emailErr) {
        console.error("Failed to send invoice email:", emailErr.message);
      }
    }

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Checkout from cart (new e-commerce flow)
exports.checkoutFromCart = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { 
      sessionId, 
      customerName, 
      customerPhone, 
      customerEmail, 
      couponCode,
      shippingMethodId,
      shippingAddressId,
      billingAddressId,
      notes,
      paymentMethod,
      ipAddress,
    } = req.body;

    // 1. Get cart
    const cart = await prisma.cart.findFirst({
      where: { 
        tenantId, 
        OR: [
          { sessionId: sessionId || undefined },
          { userId: req.user.id || undefined }
        ].filter(Boolean)
      },
      include: { items: { include: { variant: true } } }
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // 2. Calculate subtotal from cart items
    let subtotal = 0;
    const orderItemsData = [];
    for (const cartItem of cart.items) {
      const price = cartItem.variant.price;
      const total = price * cartItem.quantity;
      subtotal += total;
      orderItemsData.push({
        variantId: cartItem.variantId,
        skuAtTime: cartItem.variant.sku,
        attributes: cartItem.variant.attributes,
        quantity: cartItem.quantity,
        priceAtTime: price,
        total,
      });
    }

    // 3. Get tenant settings for delivery charge
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    let deliveryCharge = Number(tenant?.deliveryCharge || 0);
    const branch = await resolveBranchForUser(prisma, {
      tenantId,
      user: req.user,
      branchId: req.headers['x-branch-id'],
    });

    // 4. Apply shipping method if selected
    let selectedShippingMethod = null;
    if (shippingMethodId) {
      selectedShippingMethod = await prisma.shippingMethod.findFirst({ 
        where: { id: shippingMethodId, tenantId, isActive: true } 
      });
      if (selectedShippingMethod) {
        deliveryCharge = selectedShippingMethod.price;
      }
    }

    // 5. Apply coupon if provided
    let coupon = null;
    let discountAmount = 0;
    if (couponCode) {
      coupon = await prisma.coupon.findFirst({
        where: { tenantId, code: couponCode.toUpperCase(), isActive: true }
      });

      if (coupon) {
        const now = new Date();
        if (now >= coupon.startDate && (!coupon.endDate || now <= coupon.endDate)) {
          if (!coupon.usageLimit || coupon.usedCount < coupon.usageLimit) {
            if (!coupon.minOrderAmount || subtotal >= coupon.minOrderAmount) {
              if (coupon.discountType === 'PERCENTAGE') {
                discountAmount = (subtotal * coupon.discountValue) / 100;
                if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                  discountAmount = coupon.maxDiscount;
                }
              } else {
                discountAmount = coupon.discountValue;
              }
            }
          }
        }
      }
    }

    // 6. Get addresses if provided
    let shippingAddress = null;
    let billingAddress = null;
    if (shippingAddressId) {
      shippingAddress = await prisma.address.findFirst({ where: { id: shippingAddressId, tenantId } });
    }
    if (billingAddressId) {
      billingAddress = await prisma.address.findFirst({ where: { id: billingAddressId, tenantId } });
    }

    // 7. Calculate total
    const total = subtotal - discountAmount + deliveryCharge;

    // 8. Create or find customer
    let customer = null;
    if (customerPhone) {
      customer = await prisma.customer.findFirst({ where: { tenantId, phone: customerPhone } });
      if (!customer) {
        // Auto-generate customerId
        const count = await prisma.customer.count({ where: { tenantId } });
        const customerId = `CUST-${String(count + 1).padStart(4, '0')}`;
        customer = await prisma.customer.create({
          data: {
            tenantId,
            customerId,
            name: customerName || 'Guest',
            phone: customerPhone,
            email: customerEmail,
          }
        });
      } else {
        // Update existing customer
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: customerName || customer.name,
            email: customerEmail || customer.email,
            totalOrders: { increment: 1 },
            totalSpent: { increment: total },
            lastOrderAt: new Date(),
          }
        });
      }
    }

    // 9. Generate order number and create order
    const orderNumber = await generateOrderNumber(tenantId);
    const order = await prisma.order.create({
      data: {
        tenantId,
        branchId: branch.id,
        orderNumber,
        customerName: customerName || 'Guest',
        customerPhone: customerPhone || '',
        customerEmail,
        status: 'PENDING',
        paymentMethod,
        paymentStatus: paymentMethod === 'CASH_ON_DELIVERY' ? 'UNPAID' : 'PENDING',
        subtotal,
        discount: discountAmount,
        deliveryCharge,
        total,
        notes,
        ipAddress,
        customerId: customer?.id || null,
        couponId: coupon?.id || null,
        discountAmount,
        shippingMethodId: selectedShippingMethod?.id || null,
        shippingAddressId: shippingAddress?.id || null,
        billingAddressId: billingAddress?.id || null,
        items: { create: orderItemsData },
        statusHistory: { create: { status: 'PENDING', changedBy: 'checkout' } },
      },
      include: { 
        items: { include: { variant: true } },
        shippingAddress: true,
        billingAddress: true,
        shippingMethod: true,
        coupon: true,
      },
    });

    await createSuperAdminNotification({
      type: 'NEW_ORDER',
      title: 'New order received',
      message: `Order ${order.orderNumber} was placed for ${tenant?.name || 'a store'}.`,
      entityId: order.id,
      tenantId,
    });

    // 10. Update coupon usage count
    if (coupon) {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } }
      });
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          orderId: order.id,
          customerId: customer?.id || null,
        }
      });
    }

    // 11. Create payment transaction record
    if (paymentMethod) {
      await prisma.paymentTransaction.create({
        data: {
          tenantId,
          orderId: order.id,
          gateway: paymentMethod === 'CASH_ON_DELIVERY' ? 'COD' : paymentMethod,
          amount: total,
          currency: tenant?.currency || 'BDT',
          status: paymentMethod === 'CASH_ON_DELIVERY' ? 'PENDING' : 'PENDING',
        }
      });
    }

    // 12. Decrement stock (optional, can be done on confirm)
    // For COD, we don't decrement until order is confirmed

    // 13. Clear the cart
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    // Send email
    if (customerEmail) {
      try {
        const fullOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: { items: { include: { variant: true } }, tenant: true },
        });
        await sendInvoiceToCustomer(customerEmail, fullOrder, fullOrder.tenant);
      } catch (emailErr) {
        console.error("Failed to send invoice email:", emailErr.message);
      }
    }

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Update order status
exports.updateStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status, note } = req.body;
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { id, tenantId } });
      if (!order) {
        const error = new Error('Order not found');
        error.status = 404;
        throw error;
      }
      if (!allowedTransitions[order.status]?.includes(status)) {
        const error = new Error(`Invalid status transition from ${order.status} to ${status}`);
        error.status = 400;
        throw error;
      }

      const requestedBranchId = req.headers['x-branch-id'];
      if (order.branchId && requestedBranchId && order.branchId !== requestedBranchId) {
        const error = new Error('Order belongs to a different branch');
        error.status = 403;
        throw error;
      }
      const branch = await resolveBranchForUser(tx, {
        tenantId,
        user: req.user,
        branchId: order.branchId || requestedBranchId,
      });

      const claimed = await tx.order.updateMany({
        where: { id, tenantId, status: order.status },
        data: {
          status,
          ...(status === 'DELIVEred' ? { paymentStatus: 'PAID' } : {}),
        },
      });
      if (claimed.count !== 1) {
        const error = new Error('Order status changed concurrently; refresh and try again');
        error.status = 409;
        throw error;
      }

      if (status === 'CONFIRMED' || (status === 'CANCELLED' && order.status === 'CONFIRMED')) {
        const items = await tx.orderItem.findMany({ where: { orderId: id } });
        await applyOrderMovementsInTransaction(tx, {
          tenantId,
          user: req.user,
          requestedBranchId: branch.id,
          order,
          items,
          type: status === 'CONFIRMED' ? 'SALE' : 'RETURN',
          note: status === 'CONFIRMED' ? 'Order confirmed' : 'Confirmed order cancelled',
        });
      }

      await tx.orderStatusHistory.create({
        data: { orderId: id, status, note, changedBy: req.user.id },
      });
      return order;
    });

    if (updatedOrder.customerEmail) {
      sendOrderStatusEmail(updatedOrder.customerEmail, updatedOrder.orderNumber, status).catch(console.error);
    }
    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('Update status error:', error);
    next(error);
  }
};

// Bulk action
exports.bulkAction = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { orderIds, action } = req.body;
    const allowedAction = action === 'confirm' ? 'CONFIRMED' : action === 'cancel' ? 'CANCELLED' : null;
    if (!allowedAction) return res.status(400).json({ success: false, message: 'Invalid action' });
    const results = { successCount: 0, failedIds: [] };
    for (const orderId of orderIds) {
      try {
        const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
        if (!order) { results.failedIds.push(orderId); continue; }
        if (order.status !== 'PENDING') { results.failedIds.push(orderId); continue; }
        await prisma.$transaction(async (tx) => {
          const currentOrder = await tx.order.findFirst({ where: { id: orderId, tenantId } });
          if (!currentOrder || currentOrder.status !== 'PENDING') {
            const error = new Error('Order is no longer pending');
            error.status = 409;
            throw error;
          }
          const branch = await resolveBranchForUser(tx, {
            tenantId,
            user: req.user,
            branchId: currentOrder.branchId || req.headers['x-branch-id'],
          });
          const claimed = await tx.order.updateMany({
            where: { id: orderId, tenantId, status: 'PENDING' },
            data: { status: allowedAction },
          });
          if (claimed.count !== 1) {
            const error = new Error('Order status changed concurrently');
            error.status = 409;
            throw error;
          }
          if (allowedAction === 'CONFIRMED') {
            const items = await tx.orderItem.findMany({ where: { orderId } });
            await applyOrderMovementsInTransaction(tx, {
              tenantId,
              user: req.user,
              requestedBranchId: branch.id,
              order: currentOrder,
              items,
              type: 'SALE',
              note: 'Bulk order confirmation',
            });
          }
          await tx.orderStatusHistory.create({
            data: { orderId, status: allowedAction, changedBy: req.user.id, note: 'Bulk action' },
          });
        });
        results.successCount++;
      } catch (err) {
        results.failedIds.push(orderId);
      }
    }
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};

// Add internal comment
exports.addComment = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { comment } = req.body;
    const order = await prisma.order.findFirst({ where: { id, tenantId } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const newComment = order.internalComments ? `${order.internalComments}\n[${new Date().toISOString()}] ${comment}` : `[${new Date().toISOString()}] ${comment}`;
    await prisma.order.update({ where: { id }, data: { internalComments: newComment } });
    res.json({ success: true, message: 'Comment added' });
  } catch (error) {
    next(error);
  }
};

// Generate PDF invoice
exports.downloadInvoice = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: { items: { include: { variant: true } }, tenant: true },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const pdfBuffer = await generateInvoice(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// Send invoice email to customer
exports.sendInvoice = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: { items: { include: { variant: true } }, tenant: true },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!order.customerEmail) {
      return res.status(400).json({ success: false, message: 'Customer has no email address' });
    }

    await sendInvoiceToCustomer(order.customerEmail, order, order.tenant);
    res.json({ success: true, message: 'Invoice email sent to customer' });
  } catch (error) {
    console.error('Send invoice error:', error);
    next(error);
  }
};

// Delete order
exports.deleteOrder = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const order = await prisma.order.findFirst({
      where: { id, tenantId },
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    await prisma.order.delete({ where: { id } });
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    next(error);
  }
};