const prisma = require("../models");
const { applyMovementInTransaction } = require("../services/inventoryService");

const MOVEMENT_TYPES = new Set([
  "ADJUSTMENT",
  "STOCK_COUNT",
  "DAMAGE",
  "EXPIRED",
  "LOST",
]);
const ALL_MOVEMENT_TYPES = new Set([
  ...MOVEMENT_TYPES,
  "OPENING_STOCK",
  "SALE",
  "RETURN",
  "PURCHASE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "WASTE",
  "REVERSAL",
]);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const parsePagination = (query) => {
  const page = Number.parseInt(query.page || "1", 10);
  const limit = Number.parseInt(query.limit || "50", 10);
  if (!Number.isInteger(page) || page < 1) fail(400, "page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "limit must be between 1 and 100");
  return { page, limit, skip: (page - 1) * limit };
};

const parseDateRange = (query) => {
  const createdAt = {};
  if (query.startDate) {
    createdAt.gte = new Date(query.startDate);
    if (Number.isNaN(createdAt.gte.getTime())) fail(400, "startDate must be a valid date");
  }
  if (query.endDate) {
    createdAt.lte = new Date(query.endDate);
    if (Number.isNaN(createdAt.lte.getTime())) fail(400, "endDate must be a valid date");
  }
  if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) {
    fail(400, "startDate must be before endDate");
  }
  return Object.keys(createdAt).length ? createdAt : undefined;
};

const getIdempotencyKey = (req) => {
  const key = req.get?.("idempotency-key");
  if (typeof key !== "string" || key.length < 8 || key.length > 128) {
    fail(400, "Idempotency-Key header is required (8-128 characters)");
  }
  return key;
};

const listBalances = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { tenantId } = req.user;
    const branchId = req.branch.id;
    const where = {
      tenantId,
      branchId,
      ...(req.query.variantId ? { variantId: req.query.variantId } : {}),
    };
    const balances = await prisma.branchInventory.findMany({
        where,
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              price: true,
              costPrice: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        ...(req.query.lowStock === "true" ? {} : { skip, take: limit }),
      });
    const lowStockBalances = req.query.lowStock === "true"
      ? balances.filter((balance) =>
        (balance.minStock > 0 && balance.quantity <= balance.minStock) ||
        (balance.reorderLevel > 0 && balance.quantity <= balance.reorderLevel))
      : balances;
    const total = req.query.lowStock === "true"
      ? lowStockBalances.length
      : await prisma.branchInventory.count({ where });
    const pagedBalances = req.query.lowStock === "true"
      ? lowStockBalances.slice(skip, skip + limit)
      : lowStockBalances;

    res.json({
      success: true,
      data: { balances: pagedBalances, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
};

const listLowStockBalances = (req, res, next) => {
  req.query.lowStock = "true";
  return listBalances(req, res, next);
};

const updateThresholds = async (req, res, next) => {
  try {
    const { minStock, reorderLevel } = req.body || {};
    for (const [field, value] of Object.entries({ minStock, reorderLevel })) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        return res.status(400).json({ success: false, message: `${field} must be a non-negative number` });
      }
    }
    if (minStock === undefined && reorderLevel === undefined) {
      return res.status(400).json({ success: false, message: "minStock or reorderLevel is required" });
    }

    const { tenantId } = req.user;
    const branchId = req.branch.id;
    const variant = await prisma.variant.findFirst({
      where: { id: req.params.variantId, product: { tenantId } },
      select: { id: true },
    });
    if (!variant) return res.status(404).json({ success: false, message: "Variant not found" });

    const balance = await prisma.branchInventory.upsert({
      where: { branchId_variantId: { branchId, variantId: variant.id } },
      create: {
        tenantId,
        branchId,
        variantId: variant.id,
        quantity: 0,
        minStock: minStock ?? 0,
        reorderLevel: reorderLevel ?? 0,
      },
      update: {
        ...(minStock !== undefined ? { minStock } : {}),
        ...(reorderLevel !== undefined ? { reorderLevel } : {}),
      },
    });
    res.json({ success: true, data: balance });
  } catch (error) {
    next(error);
  }
};

const listMovements = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const createdAt = parseDateRange(req.query);
    if (req.query.type && !ALL_MOVEMENT_TYPES.has(req.query.type)) {
      return res.status(400).json({ success: false, message: "Invalid movement type" });
    }
    const where = {
      tenantId: req.user.tenantId,
      branchId: req.branch.id,
      ...(req.query.variantId ? { variantId: req.query.variantId } : {}),
      ...(req.query.type ? { type: req.query.type } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          variant: {
            select: { id: true, sku: true, attributes: true, product: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    res.json({ success: true, data: { movements, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

const listAdjustments = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const createdAt = parseDateRange(req.query);
    const where = {
      tenantId: req.user.tenantId,
      branchId: req.branch.id,
      ...(req.query.variantId ? { variantId: req.query.variantId } : {}),
      ...(req.query.status ? { status: req.query.status } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [adjustments, total] = await Promise.all([
      prisma.inventoryAdjustment.findMany({
        where,
        include: {
          variant: {
            select: { id: true, sku: true, attributes: true, product: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.inventoryAdjustment.count({ where }),
    ]);
    res.json({ success: true, data: { adjustments, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

const createAdjustment = async (req, res, next) => {
  try {
    const { variantId, type, quantity, countedStock, note } = req.body || {};
    if (typeof variantId !== "string" || !variantId) {
      return res.status(400).json({ success: false, message: "variantId is required" });
    }
    if (!MOVEMENT_TYPES.has(type)) {
      return res.status(400).json({ success: false, message: "Unsupported adjustment type" });
    }
    if (type === "STOCK_COUNT") {
      if (!Number.isFinite(countedStock) || countedStock < 0) {
        return res.status(400).json({ success: false, message: "countedStock must be a non-negative number" });
      }
    } else if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "quantity must be a positive number" });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 1000)) {
      return res.status(400).json({ success: false, message: "note must be a string of at most 1000 characters" });
    }

    const idempotencyKey = getIdempotencyKey(req);
    const { tenantId, id: actorId } = req.user;
    const branchId = req.branch.id;
    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.variant.findFirst({
        where: { id: variantId, product: { tenantId } },
        select: { id: true },
      });
      if (!variant) fail(404, "Variant not found");
      const applied = await applyMovementInTransaction(tx, {
        tenantId,
        branchId,
        variantId,
        type,
        ...(type === "STOCK_COUNT"
          ? { countedStock }
          : { quantity: ["DAMAGE", "EXPIRED", "LOST"].includes(type) ? -quantity : quantity }),
        idempotencyKey: `inventory-adjustment:${idempotencyKey}`,
        actorId,
        referenceType: "INVENTORY_ADJUSTMENT",
        note: note || type,
      });
      if (applied.duplicate) {
        const existingAdjustment = await tx.inventoryAdjustment.findUnique({
          where: { movementId: applied.movement.id },
        });
        if (!existingAdjustment) fail(409, "Inventory movement exists without its adjustment record");
        return {
          movement: applied.movement,
          adjustment: existingAdjustment,
          duplicate: true,
        };
      }

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          tenantId,
          branchId,
          variantId,
          movementId: applied.movement.id,
          reason: type,
          previousStock: applied.movement.previousStock,
          countedStock: applied.movement.newStock,
          delta: applied.movement.quantity,
          note: note || null,
          createdBy: actorId,
          completedAt: new Date(),
        },
      });
      return { movement: applied.movement, adjustment, duplicate: false };
    });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const reverseAdjustment = async (req, res, next) => {
  try {
    if (req.body?.note !== undefined &&
      (typeof req.body.note !== "string" || req.body.note.length > 1000)) {
      return res.status(400).json({ success: false, message: "note must be a string of at most 1000 characters" });
    }
    const idempotencyKey = getIdempotencyKey(req);
    const { tenantId, id: actorId } = req.user;
    const branchId = req.branch.id;
    const result = await prisma.$transaction(async (tx) => {
      const priorReversal = await tx.inventoryMovement.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: `inventory-reversal:${idempotencyKey}` } },
      });
      if (priorReversal) {
        if (priorReversal.branchId !== branchId ||
          priorReversal.referenceId !== req.params.adjustmentId ||
          priorReversal.referenceType !== "INVENTORY_ADJUSTMENT_REVERSAL") {
          fail(409, "Idempotency key was already used for a different reversal");
        }
        const reversal = await tx.inventoryAdjustment.findUnique({ where: { movementId: priorReversal.id } });
        if (!reversal) fail(409, "Reversal movement exists without its adjustment record");
        return {
          duplicate: true,
          reversal,
        };
      }

      const adjustment = await tx.inventoryAdjustment.findFirst({
        where: { id: req.params.adjustmentId, tenantId, branchId, status: "COMPLETED" },
      });
      if (!adjustment) {
        const existing = await tx.inventoryAdjustment.findFirst({
          where: { id: req.params.adjustmentId, tenantId, branchId },
          select: { status: true },
        });
        if (existing?.status === "REVERSED") fail(409, "Adjustment was already reversed");
        fail(404, "Completed adjustment not found");
      }
      if (!adjustment.movementId) fail(409, "Adjustment has no original inventory movement");

      const claimed = await tx.inventoryAdjustment.updateMany({
        where: { id: adjustment.id, tenantId, branchId, status: "COMPLETED" },
        data: { status: "REVERSED" },
      });
      if (claimed.count !== 1) fail(409, "Adjustment was already reversed");

      const originalMovement = await tx.inventoryMovement.findUnique({
        where: { id: adjustment.movementId },
      });
      if (!originalMovement) fail(409, "Original inventory movement is missing");
      const applied = await applyMovementInTransaction(tx, {
        tenantId,
        branchId,
        variantId: adjustment.variantId,
        type: "REVERSAL",
        quantity: -Number(originalMovement.quantity),
        idempotencyKey: `inventory-reversal:${idempotencyKey}`,
        actorId,
        referenceType: "INVENTORY_ADJUSTMENT_REVERSAL",
        referenceId: adjustment.id,
        note: req.body?.note || `Reversal of adjustment ${adjustment.id}`,
        metadata: { reversesMovementId: originalMovement.id },
      });
      const reversal = await tx.inventoryAdjustment.create({
        data: {
          tenantId,
          branchId,
          variantId: adjustment.variantId,
          movementId: applied.movement.id,
          reason: "REVERSAL",
          previousStock: applied.movement.previousStock,
          countedStock: applied.movement.newStock,
          delta: applied.movement.quantity,
          note: req.body?.note || null,
          createdBy: actorId,
          completedAt: new Date(),
        },
      });
      return { original: { ...adjustment, status: "REVERSED" }, reversal, duplicate: false };
    });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getInventoryReport = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const branchId = req.branch.id;
    const createdAt = parseDateRange(req.query);
    const [branch, balances, movements] = await Promise.all([
      prisma.branch.findFirst({
        where: { id: branchId, tenantId },
        select: { id: true, name: true, code: true },
      }),
      prisma.branchInventory.findMany({
        where: { tenantId, branchId },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              costPrice: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ quantity: "asc" }, { variantId: "asc" }],
      }),
      prisma.inventoryMovement.findMany({
        where: { tenantId, branchId, ...(createdAt ? { createdAt } : {}) },
        select: { variantId: true, type: true, quantity: true },
      }),
    ]);
    if (!branch) return res.status(404).json({ success: false, message: "Branch not found" });
    const movementTotals = new Map();
    for (const movement of movements) {
      const current = movementTotals.get(movement.variantId) || { added: 0, deducted: 0 };
      if (movement.quantity > 0) current.added += movement.quantity;
      else current.deducted += Math.abs(movement.quantity);
      movementTotals.set(movement.variantId, current);
    }
    const rows = balances.map((balance) => ({
      ...balance,
      movementTotals: movementTotals.get(balance.variantId) || { added: 0, deducted: 0 },
      stockValue: balance.quantity * Number(balance.variant.costPrice || 0),
      lowStock:
        (balance.minStock > 0 && balance.quantity <= balance.minStock) ||
        (balance.reorderLevel > 0 && balance.quantity <= balance.reorderLevel),
    }));
    res.json({
      success: true,
      data: {
        branch,
        rows,
        totals: {
          variants: rows.length,
          quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
          stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
          lowStockCount: rows.filter((row) => row.lowStock).length,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAdjustment,
  getInventoryReport,
  listAdjustments,
  listBalances,
  listLowStockBalances,
  listMovements,
  reverseAdjustment,
  updateThresholds,
};
