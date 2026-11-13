const { hasBranchPermission } = require("./branchPermissions");

const LEGACY_REASONS = {
  SALE: "SALE",
  RETURN: "RETURN",
  PURCHASE: "PURCHASE",
  ADJUSTMENT: "ADJUSTMENT",
  DAMAGE: "DAMAGE",
  OPENING_STOCK: "ADJUSTMENT",
  TRANSFER_IN: "ADJUSTMENT",
  TRANSFER_OUT: "ADJUSTMENT",
  EXPIRED: "DAMAGE",
  LOST: "DAMAGE",
  STOCK_COUNT: "ADJUSTMENT",
  WASTE: "DAMAGE",
  REVERSAL: "ADJUSTMENT",
};
const createInventoryError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const resolveBranchForUser = async (tx, { tenantId, user, branchId, permission }) => {
  const tenantAdmin = ["SUPER_ADMIN", "TENANT_OWNER", "BUSINESS_ADMIN", "OWNER"].includes(user?.role);
  const branch = await tx.branch.findFirst({
    where: { tenantId, ...(branchId ? { id: branchId } : { isDefault: true }) },
    select: { id: true, isActive: true, managerId: true },
  });
  if (!branch) throw createInventoryError("Branch not found for this tenant", 404);
  if (!branch.isActive) throw createInventoryError("Branch is inactive", 403);
  if (!tenantAdmin) {
    const membership = await tx.branchMembership.findFirst({
      where: { tenantId, branchId: branch.id, userId: user?.id, isActive: true },
      select: { id: true, role: true, permissions: true },
    });
    const managerBranchPermission = !membership && branch.managerId === user?.id &&
      permission?.startsWith("branches.");
    if (!membership && !managerBranchPermission) {
      throw createInventoryError("You do not have access to this branch", 403);
    }
    if (permission) {
      if (!managerBranchPermission && !hasBranchPermission(membership, permission)) {
        throw createInventoryError(`Branch permission ${permission} is required`, 403);
      }
    }
  }
  return branch;
};

const applyOrderMovementsInTransaction = async (tx, {
  tenantId,
  user,
  requestedBranchId,
  order,
  items,
  type,
  note,
}) => {
  if (order.branchId && requestedBranchId && order.branchId !== requestedBranchId) {
    throw createInventoryError("Order belongs to a different branch", 403);
  }
  const branch = await resolveBranchForUser(tx, {
    tenantId,
    user,
    branchId: order.branchId || requestedBranchId,
  });
  for (const item of items) {
    const quantity = type === "SALE" ? -Number(item.quantity) : Number(item.quantity);
    await applyMovementInTransaction(tx, {
      tenantId,
      branchId: branch.id,
      variantId: item.variantId,
      type,
      quantity,
      idempotencyKey: `order:${order.id}:item:${item.id}:${type}`,
      orderId: order.id,
      actorId: user?.id,
      referenceType: "ORDER",
      referenceId: order.id,
      note,
    });
  }
  return branch;
};

const applyMovementInTransaction = async (tx, input) => {
  const {
    tenantId,
    branchId,
    variantId,
    type,
    quantity,
    countedStock,
    idempotencyKey,
    orderId,
    actorId,
    referenceType,
    referenceId,
    note,
    metadata = {},
  } = input;

  if (!tenantId || !branchId || !variantId || !idempotencyKey) {
    throw createInventoryError("tenantId, branchId, variantId, and idempotencyKey are required");
  }
  if (!Object.prototype.hasOwnProperty.call(LEGACY_REASONS, type)) {
    throw createInventoryError("Unsupported inventory movement type");
  }
  if (countedStock !== undefined) {
    if (type !== "STOCK_COUNT" || !Number.isFinite(countedStock) || countedStock < 0) {
      throw createInventoryError("countedStock is only valid for a non-negative stock count");
    }
  } else if (!Number.isFinite(quantity) || quantity === 0) {
    throw createInventoryError("Inventory movement quantity must be a non-zero finite number");
  }

  // First, check if there's already a movement with this idempotency key (outside the row lock)
  const priorMovement = await tx.inventoryMovement.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
  });
  if (priorMovement) {
    if (priorMovement.branchId !== branchId || priorMovement.variantId !== variantId ||
      priorMovement.type !== type ||
      (countedStock !== undefined
        ? Number(priorMovement.metadata?.countedStock) !== countedStock
        : Number(priorMovement.quantity) !== quantity)) {
      throw createInventoryError("Idempotency key was already used for a different inventory movement", 409);
    }
    return { movement: priorMovement, duplicate: true };
  }

  // Get branch and variant info (to validate)
  const branch = await tx.branch.findFirst({
    where: { id: branchId, tenantId },
    select: { id: true },
  });
  if (!branch) throw createInventoryError("Branch not found for this tenant", 404);

  const variant = await tx.variant.findFirst({
    where: { id: variantId, product: { tenantId } },
    select: { id: true },
  });
  if (!variant) throw createInventoryError("Variant not found for this tenant", 404);

  // Use a single query to get tenant config and branch inventory in parallel
  const [tenant] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: { allowNegativeStock: true } }),
  ]);
  if (!tenant) throw createInventoryError("Tenant not found", 404);

  await tx.branchInventory.upsert({
    where: { branchId_variantId: { branchId, variantId } },
    create: { tenantId, branchId, variantId, quantity: 0 },
    update: {},
  });
  await tx.$queryRawUnsafe(
    'SELECT "id" FROM "BranchInventory" WHERE "branchId" = $1 AND "variantId" = $2 FOR UPDATE',
    branchId,
    variantId,
  );

  const inventory = await tx.branchInventory.findUnique({
    where: { branchId_variantId: { branchId, variantId } },
  });
  if (!inventory) throw createInventoryError("Branch inventory row could not be locked", 500);

  // Re-check idempotency after acquiring the balance lock.
  const movementAfterLock = await tx.inventoryMovement.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
  });
  if (movementAfterLock) {
    if (movementAfterLock.branchId !== branchId || movementAfterLock.variantId !== variantId ||
      movementAfterLock.type !== type ||
      (countedStock !== undefined
        ? Number(movementAfterLock.metadata?.countedStock) !== countedStock
        : Number(movementAfterLock.quantity) !== quantity)) {
      throw createInventoryError("Idempotency key was already used for a different inventory movement", 409);
    }
    return { movement: movementAfterLock, duplicate: true };
  }

  const previousStock = Number(inventory.quantity);
  const movementQuantity = countedStock !== undefined ? countedStock - previousStock : quantity;
  if (!Number.isFinite(movementQuantity) || movementQuantity === 0) {
    throw createInventoryError("Stock count matches the current inventory balance");
  }
  const newStock = previousStock + movementQuantity;
  if (!Number.isFinite(newStock)) throw createInventoryError("Inventory balance is invalid", 500);
  if (!tenant.allowNegativeStock && newStock < 0) {
    throw createInventoryError("Insufficient stock for this branch");
  }

  // Update branch inventory and variant stock within the same transaction
  await tx.branchInventory.update({
    where: { branchId_variantId: { branchId, variantId } },
    data: { quantity: newStock },
  });
  await tx.variant.update({
    where: { id: variantId },
    data: { stock: { increment: movementQuantity } },
  });

  const movement = await tx.inventoryMovement.create({
    data: {
      tenantId,
      branchId,
      variantId,
      type,
      quantity: movementQuantity,
      previousStock,
      newStock,
      idempotencyKey,
      orderId,
      actorId,
      referenceType,
      referenceId,
      note,
      metadata: countedStock === undefined ? metadata : { ...metadata, countedStock },
    },
  });

  await tx.inventoryLog.create({
    data: {
      variantId,
      quantity: movementQuantity,
      reason: LEGACY_REASONS[type],
      orderId,
    },
  });

  return { movement, duplicate: false };
};

module.exports = {
  applyMovementInTransaction,
  applyOrderMovementsInTransaction,
  createInventoryError,
  resolveBranchForUser,
};
