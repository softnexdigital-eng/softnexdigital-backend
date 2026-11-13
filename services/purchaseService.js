const { applyMovementInTransaction } = require("./inventoryService");
const { hasBranchPermission } = require("./branchPermissions");

const createPurchaseError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const generateOrderNumber = async (tx, tenantId) => {
  const tenant = await tx.tenant.update({
    where: { id: tenantId },
    data: { orderCounter: { increment: 1 } },
    select: { orderCounter: true },
  });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = require("crypto").randomBytes(3).toString("hex").toUpperCase();
  return `PO-${dateStr}-${String(tenant.orderCounter).padStart(4, "0")}-${randomSuffix}`;
};

const lockPurchaseOrder = (tx, { tenantId, id }) =>
  tx.$queryRawUnsafe(
    'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
    id,
    tenantId,
  );

const resolveBranchForPurchase = async (tx, { tenantId, user, branchId, permission }) => {
  const tenantAdmin = ["SUPER_ADMIN", "TENANT_OWNER", "BUSINESS_ADMIN", "OWNER"].includes(user?.role);
  const branch = await tx.branch.findFirst({
    where: { tenantId, ...(branchId ? { id: branchId } : { isDefault: true }) },
    select: { id: true, isActive: true, managerId: true },
  });
  if (!branch) throw createPurchaseError("Branch not found for this tenant", 404);
  if (!branch.isActive) throw createPurchaseError("Branch is inactive", 403);
  if (!tenantAdmin) {
    const membership = await tx.branchMembership.findFirst({
      where: { tenantId, branchId: branch.id, userId: user?.id, isActive: true },
      select: { id: true, role: true, permissions: true },
    });
    const managerBranchPermission = !membership && branch.managerId === user?.id &&
      permission?.startsWith("branches.");
    if (!membership && !managerBranchPermission) {
      throw createPurchaseError("You do not have access to this branch", 403);
    }
    if (permission) {
      if (!managerBranchPermission && !hasBranchPermission(membership, permission)) {
        throw createPurchaseError(`Branch permission ${permission} is required`, 403);
      }
    }
  }
  return branch;
};

const createPurchaseOrder = async (tx, input) => {
  const { tenantId, user, supplierId, branchId, items, notes, expectedAt } = input;

  if (!items?.length) throw createPurchaseError("At least one item is required", 400);

  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!supplier) throw createPurchaseError("Supplier not found or inactive", 404);

  const branch = await resolveBranchForPurchase(tx, { tenantId, user, branchId });

  const variantIds = items.map((item) => item.variantId);
  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds }, product: { tenantId } },
    select: { id: true, sku: true, costPrice: true, productId: true, supplierId: true },
  });
  if (variants.length !== variantIds.length) {
    throw createPurchaseError("One or more variants not found for this tenant", 404);
  }

  // Validate that all selected variants belong to the selected supplier
  const variantsWithSupplier = variants.filter((v) => v.supplierId && v.supplierId === supplierId);
  if (variantsWithSupplier.length !== variantIds.length) {
    throw createPurchaseError("Some variants do not belong to the selected supplier");
  }

  const orderNumber = await generateOrderNumber(tx, tenantId);

  let subtotal = 0;
  const itemsData = items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    const costPrice = item.costPrice ?? variant?.costPrice ?? 0;
    const lineTotal = costPrice * item.quantity;
    subtotal += lineTotal;
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      costPrice,
      notes: item.notes,
    };
  });

  const taxAmount = 0;
  const totalAmount = subtotal + taxAmount;

  const purchaseOrder = await tx.purchaseOrder.create({
    data: {
      tenantId,
      supplierId,
      branchId: branch.id,
      orderNumber,
      status: "DRAFT",
      subtotal,
      taxAmount,
      totalAmount,
      notes,
      expectedAt: expectedAt ? new Date(expectedAt) : null,
      createdBy: user.id,
      items: { create: itemsData },
    },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });

  return purchaseOrder;
};

const getPurchaseOrder = async (tx, { tenantId, id, branchId }) => {
  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: { id, tenantId, ...(branchId ? { branchId } : {}) },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true, costPrice: true, product: { select: { id: true, name: true } } } } } },
      supplier: { select: { id: true, name: true, contactPerson: true, phone: true, email: true, address: true } },
      branch: { select: { id: true, name: true, code: true } },
      receipts: {
        include: {
          items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
        },
        orderBy: { receivedAt: "desc" },
      },
    },
  });
  if (!purchaseOrder) throw createPurchaseError("Purchase order not found", 404);
  return purchaseOrder;
};

const listPurchaseOrders = async (tx, { tenantId, page = 1, limit = 20, status, supplierId, branchId, startDate, endDate }) => {
  const where = { tenantId };
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  if (branchId) where.branchId = branchId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [orders, total] = await Promise.all([
    tx.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    tx.purchaseOrder.count({ where }),
  ]);

  return { orders, total, page, limit };
};

const updatePurchaseOrder = async (tx, { tenantId, id, user, branchId, data }) => {
  await lockPurchaseOrder(tx, { tenantId, id });
  const existing = await tx.purchaseOrder.findFirst({
    where: { id, tenantId, ...(branchId ? { branchId } : {}) },
  });
  if (!existing) throw createPurchaseError("Purchase order not found", 404);
  if (existing.status !== "DRAFT") {
    throw createPurchaseError("Only draft purchase orders can be edited", 400);
  }
  if (data.branchId && branchId && data.branchId !== branchId) {
    throw createPurchaseError("Purchase order cannot be moved to a branch you have not authorized", 403);
  }

  let itemsData = data.items;
  let subtotal = existing.subtotal;
  let taxAmount = existing.taxAmount;
  let totalAmount = existing.totalAmount;

  if (itemsData?.length) {
    const targetSupplierId = data.supplierId || existing.supplierId;
    const supplier = await tx.supplier.findFirst({
      where: { id: targetSupplierId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!supplier) throw createPurchaseError("Supplier not found or inactive", 404);

    const variantIds = itemsData.map((item) => item.variantId);
    const variants = await tx.variant.findMany({
      where: { id: { in: variantIds }, product: { tenantId } },
      select: { id: true, costPrice: true, supplierId: true },
    });
    if (variants.length !== variantIds.length) {
      throw createPurchaseError("One or more variants not found for this tenant", 404);
    }
    if (variants.some((variant) => variant.supplierId !== targetSupplierId)) {
      throw createPurchaseError("Some variants do not belong to the selected supplier");
    }

    subtotal = 0;
    itemsData = itemsData.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);
      const costPrice = item.costPrice ?? variant?.costPrice ?? 0;
      const lineTotal = costPrice * item.quantity;
      subtotal += lineTotal;
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        costPrice,
        notes: item.notes,
      };
    });
    totalAmount = subtotal + taxAmount;
  }

  const updated = await tx.purchaseOrder.update({
    where: { id },
    data: {
      ...(data.supplierId ? { supplierId: data.supplierId } : {}),
      ...(data.branchId ? { branchId: data.branchId } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.expectedAt !== undefined ? { expectedAt: data.expectedAt ? new Date(data.expectedAt) : null } : {}),
      ...(itemsData ? { items: { deleteMany: {}, create: itemsData } } : {}),
      ...(itemsData ? { subtotal, totalAmount } : {}),
    },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });

  return updated;
};

const submitPurchaseOrder = async (tx, { tenantId, id, user, branchId }) => {
  await lockPurchaseOrder(tx, { tenantId, id });
  const existing = await tx.purchaseOrder.findFirst({
    where: { id, tenantId, ...(branchId ? { branchId } : {}) },
  });
  if (!existing) throw createPurchaseError("Purchase order not found", 404);
  if (existing.status !== "DRAFT") {
    throw createPurchaseError("Only draft purchase orders can be submitted", 400);
  }
  if (!existing.items?.length) {
    throw createPurchaseError("Purchase order has no items", 400);
  }

  const updated = await tx.purchaseOrder.update({
    where: { id },
    data: { status: "ORDERED" },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });

  return updated;
};

const cancelPurchaseOrder = async (tx, { tenantId, id, user, branchId }) => {
  await lockPurchaseOrder(tx, { tenantId, id });
  const existing = await tx.purchaseOrder.findFirst({
    where: { id, tenantId, ...(branchId ? { branchId } : {}) },
  });
  if (!existing) throw createPurchaseError("Purchase order not found", 404);
  if (existing.status === "RECEIVED") {
    throw createPurchaseError("Cannot cancel a fully received purchase order", 400);
  }
  if (existing.status === "CANCELLED") {
    throw createPurchaseError("Purchase order is already cancelled", 400);
  }

  const updated = await tx.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED" },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });

  return updated;
};

const receivePurchaseOrder = async (tx, input) => {
  const { tenantId, user, purchaseOrderId, branchId, items, notes } = input;

  await lockPurchaseOrder(tx, { tenantId, id: purchaseOrderId });
  const purchaseOrder = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId, ...(branchId ? { branchId } : {}) },
    include: {
      items: {
        include: { variant: { select: { id: true, sku: true, costPrice: true } } },
      },
      branch: { select: { id: true, isActive: true } },
    },
  });
  if (!purchaseOrder) throw createPurchaseError("Purchase order not found", 404);
  if (!purchaseOrder.branch.isActive) throw createPurchaseError("Branch is inactive", 403);
  if (purchaseOrder.status === "CANCELLED") throw createPurchaseError("Cannot receive against a cancelled order", 400);
  if (purchaseOrder.status === "RECEIVED") throw createPurchaseError("Purchase order is already fully received", 400);

  const branch = await resolveBranchForPurchase(tx, {
    tenantId,
    user,
    branchId: purchaseOrder.branchId,
    permission: "purchase.receive",
  });

  if (!items?.length) throw createPurchaseError("At least one receipt item is required", 400);

  for (const item of items) {
    const poItem = purchaseOrder.items.find((i) => i.id === item.purchaseOrderItemId);
    if (!poItem) throw createPurchaseError(`Purchase order item ${item.purchaseOrderItemId} not found`, 404);
    if (item.quantity <= 0) throw createPurchaseError("Received quantity must be positive", 400);
    if (poItem.receivedQty + item.quantity > poItem.quantity) {
      throw createPurchaseError(`Received quantity exceeds ordered quantity for ${poItem.variant.sku}`, 400);
    }
  }

  const receipt = await tx.purchaseReceipt.create({
    data: {
      tenantId,
      purchaseOrderId,
      branchId: branch.id,
      receivedBy: user.id,
      notes,
      items: {
        create: items.map((item) => {
          const poItem = purchaseOrder.items.find((i) => i.id === item.purchaseOrderItemId);
          return {
            purchaseOrderItemId: item.purchaseOrderItemId,
            variantId: poItem.variantId,
            quantity: item.quantity,
            costPrice: item.costPrice ?? poItem.costPrice,
            notes: item.notes,
          };
        }),
      },
    },
    include: {
      items: { include: { variant: { select: { id: true, sku: true, attributes: true } } } },
    },
  });

  for (const item of items) {
    const poItem = purchaseOrder.items.find((i) => i.id === item.purchaseOrderItemId);
    const newReceivedQty = poItem.receivedQty + item.quantity;
    await tx.purchaseOrderItem.update({
      where: { id: poItem.id },
      data: { receivedQty: newReceivedQty },
    });

    await applyMovementInTransaction(tx, {
      tenantId,
      branchId: branch.id,
      variantId: poItem.variantId,
      type: "PURCHASE",
      quantity: item.quantity,
      idempotencyKey: `purchase-receive:${receipt.id}:item:${poItem.id}`,
      orderId: null,
      actorId: user.id,
      referenceType: "PURCHASE_RECEIPT",
      referenceId: receipt.id,
      note: `Received ${item.quantity} of ${poItem.variant.sku} for PO ${purchaseOrder.orderNumber}`,
      metadata: { purchaseOrderId, purchaseOrderItemId: poItem.id, purchaseReceiptId: receipt.id },
    });
  }

  const updatedOrder = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId },
    include: { items: true },
  });

  const allReceived = updatedOrder.items.every((i) => i.receivedQty >= i.quantity);
  const anyReceived = updatedOrder.items.some((i) => i.receivedQty > 0);

  let newStatus = purchaseOrder.status;
  if (allReceived) newStatus = "RECEIVED";
  else if (anyReceived) newStatus = "PARTIALLY_RECEIVED";

  if (newStatus !== purchaseOrder.status) {
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: newStatus, ...(newStatus === "RECEIVED" ? { receivedAt: new Date() } : {}) },
    });
  }

  return { receipt, order: { ...updatedOrder, status: newStatus } };
};

const createSupplierPayment = async (tx, input) => {
  const { tenantId, user, supplierId, purchaseOrderId, amount, method, reference, notes, paidAt } = input;

  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!supplier) throw createPurchaseError("Supplier not found or inactive", 404);

  if (purchaseOrderId) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "PurchaseOrder" WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
      purchaseOrderId,
      tenantId,
    );
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId, supplierId },
      select: { id: true, totalAmount: true, status: true },
    });
    if (!po) throw createPurchaseError("Purchase order not found or doesn't belong to this supplier", 404);
    if (po.status === "CANCELLED") {
      throw createPurchaseError("Cannot pay a cancelled purchase order", 400);
    }

    const existingPayments = await tx.supplierPayment.findMany({
      where: { tenantId, purchaseOrderId },
      select: { amount: true },
    });
    const paidAmount = existingPayments.reduce((total, payment) => total + Number(payment.amount), 0);
    if (amount > Math.max(0, po.totalAmount - paidAmount)) {
      throw createPurchaseError("Payment exceeds the remaining amount due", 400);
    }
  }

  const payment = await tx.supplierPayment.create({
    data: {
      tenantId,
      supplierId,
      purchaseOrderId: purchaseOrderId || null,
      amount,
      method,
      reference,
      notes,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      createdBy: user.id,
    },
    include: {
      supplier: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, orderNumber: true } },
    },
  });

  return payment;
};

const listSupplierPayments = async (tx, { tenantId, page = 1, limit = 20, supplierId, purchaseOrderId, startDate, endDate }) => {
  const where = { tenantId };
  if (supplierId) where.supplierId = supplierId;
  if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
  if (startDate || endDate) {
    where.paidAt = {};
    if (startDate) where.paidAt.gte = new Date(startDate);
    if (endDate) where.paidAt.lte = new Date(endDate);
  }

  const [payments, total] = await Promise.all([
    tx.supplierPayment.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, orderNumber: true } },
      },
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    tx.supplierPayment.count({ where }),
  ]);

  return { payments, total, page, limit };
};

const getSupplierLedger = async (tx, { tenantId, supplierId, startDate, endDate }) => {
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { id: true, name: true },
  });
  if (!supplier) throw createPurchaseError("Supplier not found", 404);

  const where = { supplierId, tenantId };
  if (startDate || endDate) {
    where.paidAt = {};
    if (startDate) where.paidAt.gte = new Date(startDate);
    if (endDate) where.paidAt.lte = new Date(endDate);
  }

  const payments = await tx.supplierPayment.findMany({
    where,
    include: { purchaseOrder: { select: { id: true, orderNumber: true } } },
    orderBy: { paidAt: "asc" },
  });

  const purchaseOrders = await tx.purchaseOrder.findMany({
    where: { supplierId, tenantId },
    select: { id: true, orderNumber: true, totalAmount: true, status: true, receivedAt: true },
  });

  let totalDue = 0;
  for (const po of purchaseOrders) {
    const paid = payments
      .filter((p) => p.purchaseOrderId === po.id)
      .reduce((sum, p) => sum + p.amount, 0);
    if (po.status !== "CANCELLED") {
      totalDue += po.totalAmount - paid;
    }
  }

  return {
    supplier,
    purchaseOrders,
    payments,
    summary: {
      totalPurchases: purchaseOrders.filter((p) => p.status !== "CANCELLED").reduce((sum, p) => sum + p.totalAmount, 0),
      totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
      totalDue,
    },
  };
};

module.exports = {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrder,
  submitPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  createSupplierPayment,
  listSupplierPayments,
  getSupplierLedger,
  generateOrderNumber,
  resolveBranchForPurchase,
};