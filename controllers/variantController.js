const prisma = require('../models');
const { cartesianProduct } = require('../utils/cartesian');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { randomUUID } = require('crypto');
const { applyMovementInTransaction, resolveBranchForUser } = require('../services/inventoryService');

// SUPER_ADMIN check helper
function checkSuperAdmin(role) {
  if (role === 'SUPER_ADMIN') {
    return { allowed: false, message: 'Super Admin cannot manage variants. Please login as a Business Admin.' };
  }
  return { allowed: true };
}

// Verify product belongs to tenant
async function verifyProductAccess(productId, tenantId) {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
  });
  if (!product) throw new Error('Product not found or access denied');
  return product;
}

function validateVariantAttributes(attributes) {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return 'Attributes must be an object of single string values';
  }
  for (const [name, value] of Object.entries(attributes)) {
    if (typeof value !== 'string' || !value.trim()) {
      return `Attribute "${name}" must have exactly one non-empty string value`;
    }
    const trimmed = value.trim();
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || trimmed.split(',').filter(Boolean).length > 1) {
      return `Attribute "${name}" must contain one value, not a legacy multi-value list`;
    }
  }
  return null;
}

function combinationKey(attributes) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(attributes || {}).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function legacyValues(value) {
  if (Array.isArray(value)) return value.flatMap(legacyValues);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.flatMap(legacyValues);
    } catch {
      return [];
    }
  }
  return trimmed.includes(',')
    ? trimmed.split(',').map((part) => part.trim()).filter(Boolean)
    : [trimmed];
}

function legacyCombinationKeys(attributes) {
  const entries = Object.entries(attributes || {}).map(([key, value]) => [key, [...new Set(legacyValues(value))]]);
  if (entries.some(([, values]) => values.length === 0)) return [combinationKey(attributes)];
  const combinations = entries.reduce(
    (rows, [key, values]) => rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))),
    [{}],
  );
  return combinations.map(combinationKey);
}

async function hasDuplicateCombination(productId, attributes, exceptId) {
  const variants = await prisma.variant.findMany({
    where: { productId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, attributes: true },
  });
  const key = combinationKey(attributes);
  return variants.some((variant) => legacyCombinationKeys(variant.attributes).includes(key));
}

// List all variants for a specific product or supplier
exports.getVariants = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const { productId, supplierId } = req.query;
    if (!productId && !supplierId) {
      return res.status(400).json({ success: false, message: 'productId or supplierId query parameter is required' });
    }

    // Verify product access if productId is provided
    if (productId) {
      await verifyProductAccess(productId, tenantId);
    }

    const where = { product: { tenantId } };
    if (productId) {
      where.productId = productId;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }

    const variants = await prisma.variant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variantImages: { orderBy: { sortOrder: 'asc' } },
        product: { select: { id: true, name: true } }
      },
    });
    res.json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
};

// Add single variant to a specific product
exports.addVariant = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const { productId, sku, attributes, price, compareAtPrice, costPrice, stock, image, supplierId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    if (!sku) {
      return res.status(400).json({ success: false, message: 'SKU is required' });
    }
    if (price === undefined || price === null) {
      return res.status(400).json({ success: false, message: 'Price is required' });
    }
    const attributesError = validateVariantAttributes(attributes || {});
    if (attributesError) {
      return res.status(400).json({ success: false, message: attributesError });
    }

    // Verify product access
    await verifyProductAccess(productId, tenantId);
    if (await hasDuplicateCombination(productId, attributes || {})) {
      return res.status(409).json({ success: false, message: 'This variant combination already exists' });
    }

    // Check SKU uniqueness within tenant's products
    const existing = await prisma.variant.findUnique({ where: { sku } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'SKU already exists' });
    }

    // Verify supplier belongs to tenant if provided
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
      if (!supplier) {
        return res.status(400).json({ success: false, message: 'Supplier not found' });
      }
    }

    const openingQuantity = stock === undefined ? 0 : Number(stock);
    if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
      return res.status(400).json({ success: false, message: 'stock must be a non-negative number' });
    }
    const variant = await prisma.$transaction(async (tx) => {
      const created = await tx.variant.create({
        data: {
          productId,
          sku,
          attributes: attributes || {},
          price: parseFloat(price),
          compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
          costPrice: costPrice ? parseFloat(costPrice) : 0,
          stock: 0,
          image: image || null,
          supplierId: supplierId || null,
        },
      });
      if (openingQuantity > 0) {
        const branch = await resolveBranchForUser(tx, {
          tenantId,
          user: req.user,
          branchId: req.headers['x-branch-id'],
          permission: 'inventory.adjust',
        });
        await applyMovementInTransaction(tx, {
          tenantId,
          branchId: branch.id,
          variantId: created.id,
          type: 'ADJUSTMENT',
          quantity: openingQuantity,
          idempotencyKey: `variant-create:${created.id}:opening-stock`,
          actorId: req.user.id,
          referenceType: 'VARIANT_CREATE',
          referenceId: created.id,
          note: 'Initial variant stock',
        });
      }
      return tx.variant.findUnique({ where: { id: created.id } });
    });
    res.status(201).json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
};

// Bulk generate variants using cartesian product
exports.bulkGenerateVariants = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { productId, attributes, basePrice, skuPrefix } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }

    // Verify product access
    await verifyProductAccess(productId, tenantId);

    // attributes format: { Size: ['S','M'], Color: ['red','Blue'] }
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return res.status(400).json({ success: false, message: 'attributes must be an object of option arrays' });
    }
    for (const [name, values] of Object.entries(attributes)) {
      if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value.trim())) {
        return res.status(400).json({ success: false, message: `Attribute "${name}" must have one or more string options` });
      }
    }
    const combinations = cartesianProduct(attributes);
    const existingVariants = await prisma.variant.findMany({ where: { productId }, select: { sku: true, attributes: true } });
    const existingSkus = new Set(existingVariants.map((variant) => variant.sku.toLowerCase()));
    const existingCombinations = new Set(existingVariants.flatMap((variant) => legacyCombinationKeys(variant.attributes)));

    const createdVariants = [];
    for (const combo of combinations) {
      const comboError = validateVariantAttributes(combo);
      if (comboError) return res.status(400).json({ success: false, message: comboError });
      const combination = combinationKey(combo);
      const sku = `${skuPrefix || 'VAR'}-${Object.values(combo).join('-')}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      if (existingCombinations.has(combination) || existingSkus.has(sku.toLowerCase())) continue;
      const variant = await prisma.variant.create({
        data: {
          productId,
          sku,
          attributes: combo,
          price: basePrice ? parseFloat(basePrice) : 0,
          stock: 0,
        },
      });
      createdVariants.push(variant);
      existingCombinations.add(combination);
      existingSkus.add(sku.toLowerCase());
    }
    res.json({ success: true, data: { totalGenerated: createdVariants.length, variants: createdVariants } });
  } catch (error) {
    next(error);
  }
};

// Bulk upload CSV
exports.bulkUploadCSV = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    // Verify product access
    await verifyProductAccess(productId, tenantId);

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'CSV file required' });
    }

    const results = [];
    const bufferStream = Readable.from(req.file.buffer);
    await new Promise((resolve, reject) => {
      bufferStream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    let successCount = 0;
    const errors = [];
    for (const row of results) {
      const { sku, price, stock, ...attributes } = row;
      if (!sku) {
        errors.push({ row, error: 'SKU missing' });
        continue;
      }
      try {
        const attributesError = validateVariantAttributes(attributes);
        if (attributesError) throw new Error(attributesError);
        const existing = await prisma.variant.findUnique({ where: { sku } });
        if (existing) {
          if (existing.productId !== productId) throw new Error('SKU belongs to another product');
          if (await hasDuplicateCombination(productId, attributes, existing.id)) {
            throw new Error('This variant combination already exists');
          }
          await prisma.$transaction(async (tx) => {
            if (stock !== undefined && stock !== '') {
              const targetStock = Number(stock);
              if (!Number.isFinite(targetStock) || targetStock < 0) throw new Error('Stock must be a non-negative number');
              const branch = await resolveBranchForUser(tx, {
                tenantId,
                user: req.user,
                branchId: req.headers['x-branch-id'],
                permission: 'inventory.adjust',
              });
              const balance = await tx.branchInventory.findUnique({
                where: { branchId_variantId: { branchId: branch.id, variantId: existing.id } },
                select: { quantity: true },
              });
              if (!balance) throw new Error('Branch inventory is not initialized for this variant');
              const delta = targetStock - Number(balance.quantity);
              if (delta !== 0) {
                await applyMovementInTransaction(tx, {
                  tenantId,
                  branchId: branch.id,
                  variantId: existing.id,
                  type: 'ADJUSTMENT',
                  quantity: delta,
                  idempotencyKey: `csv-stock:${randomUUID()}`,
                  actorId: req.user.id,
                  referenceType: 'VARIANT_CSV_IMPORT',
                  referenceId: sku,
                  note: 'Stock updated from variant CSV',
                });
              }
            }
            await tx.variant.update({
              where: { sku },
              data: {
                attributes,
                price: parseFloat(price) || existing.price,
              },
            });
          });
        } else {
          if (await hasDuplicateCombination(productId, attributes)) {
            throw new Error('This variant combination already exists');
          }
          const openingStock = stock === undefined || stock === '' ? 0 : Number(stock);
          if (!Number.isFinite(openingStock) || openingStock < 0) throw new Error('Stock must be a non-negative number');
          await prisma.$transaction(async (tx) => {
            const created = await tx.variant.create({
              data: {
                productId,
                sku,
                attributes,
                price: parseFloat(price) || 0,
                stock: 0,
              },
            });
            if (openingStock > 0) {
              const branch = await resolveBranchForUser(tx, {
                tenantId,
                user: req.user,
                branchId: req.headers['x-branch-id'],
                permission: 'inventory.adjust',
              });
              await applyMovementInTransaction(tx, {
                tenantId,
                branchId: branch.id,
                variantId: created.id,
                type: 'ADJUSTMENT',
                quantity: openingStock,
                idempotencyKey: `csv-stock:${created.id}:opening`,
                actorId: req.user.id,
                referenceType: 'VARIANT_CSV_IMPORT',
                referenceId: sku,
                note: 'Opening stock from variant CSV',
              });
            }
          });
        }
        successCount++;
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }
    res.json({ success: true, data: { successCount, errors } });
  } catch (error) {
    next(error);
  }
};

// Update variant
exports.updateVariant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { price, stock, image, attributes, compareAtPrice, costPrice, supplierId } = req.body;
    const { tenantId } = req.user;

    // Verify variant belongs to tenant's product
    const variant = await prisma.variant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!variant || variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    if (attributes !== undefined) {
      const attributesError = validateVariantAttributes(attributes);
      if (attributesError) {
        return res.status(400).json({ success: false, message: attributesError });
      }
      if (await hasDuplicateCombination(variant.productId, attributes, variant.id)) {
        return res.status(409).json({ success: false, message: 'This variant combination already exists' });
      }
    }

    // Verify supplier if provided
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
      if (!supplier) {
        return res.status(400).json({ success: false, message: 'Supplier not found' });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (stock !== undefined) {
        const targetStock = Number(stock);
        if (!Number.isFinite(targetStock) || targetStock < 0) {
          const error = new Error('stock must be a non-negative number');
          error.status = 400;
          throw error;
        }
        const branch = await resolveBranchForUser(tx, {
          tenantId,
          user: req.user,
          branchId: req.headers['x-branch-id'],
          permission: 'inventory.adjust',
        });
        const balance = await tx.branchInventory.findUnique({
          where: { branchId_variantId: { branchId: branch.id, variantId: id } },
          select: { quantity: true },
        });
        const delta = targetStock - Number(balance?.quantity || 0);
        if (delta !== 0) {
          await applyMovementInTransaction(tx, {
            tenantId,
            branchId: branch.id,
            variantId: id,
            type: 'ADJUSTMENT',
            quantity: delta,
            idempotencyKey: `variant-update:${id}:${randomUUID()}`,
            actorId: req.user.id,
            referenceType: 'VARIANT_UPDATE',
            referenceId: id,
            note: 'Variant stock updated',
          });
        }
      }
      return tx.variant.update({
        where: { id },
        data: {
          price: price !== undefined ? parseFloat(price) : undefined,
          image: image !== undefined ? image : undefined,
          attributes: attributes || undefined,
          compareAtPrice: compareAtPrice !== undefined ? (compareAtPrice ? parseFloat(compareAtPrice) : null) : undefined,
          costPrice: costPrice !== undefined ? parseFloat(costPrice) : undefined,
          supplierId: supplierId !== undefined ? supplierId : undefined,
        },
      });
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete variant
exports.deleteVariant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const variant = await prisma.variant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!variant || variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    // Delete dependent records first (foreign key constraints)
    await prisma.$transaction([
      prisma.cartItem.deleteMany({ where: { variantId: id } }),
      prisma.wishlist.deleteMany({ where: { variantId: id } }),
      prisma.variant.delete({ where: { id } }),
    ]);

    res.json({ success: true, message: 'Variant deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Find exact matching variant by selected attributes (storefront utility)
exports.matchVariant = async (req, res, next) => {
  try {
    const { productId, attributes } = req.body || {};
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ success: false, message: 'productId is required' });
    }
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      return res.status(400).json({ success: false, message: 'attributes object is required' });
    }

    // Resolve tenant server-side only (auth or slug-derived). Never trust client tenantId.
    let tenantId = req.user?.tenantId || null;
    if (!tenantId) {
      // Try resolve from product + optional store slug context if provided by route middleware later
      // For now require resolvable tenant context
      return res.status(400).json({ success: false, message: 'Tenant context is required to match a variant' });
    }

    const defaultBranch = await prisma.branch.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
      select: { id: true },
    });
    const defaultBranchId = defaultBranch?.id || null;

    const variants = await prisma.variant.findMany({
      where: { productId, product: { tenantId } },
      include: {
        product: { select: { id: true, tenantId: true } },
        branchInventories: { select: { branchId: true, quantity: true } },
      },
    });

    const normalize = (attrs) => {
      const out = {};
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return out;
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        let val = v;
        if (Array.isArray(val)) val = val.length ? val[0] : null;
        if (typeof val === 'string') {
          const t = val.trim();
          if (t.startsWith('[') && t.endsWith(']')) {
            try { const p = JSON.parse(t); val = Array.isArray(p) && p.length ? p[0] : t; } catch { val = t; }
          } else val = t;
        }
        if (val == null) continue;
        out[String(k)] = String(val).trim();
      }
      return out;
    };
    const selected = normalize(attributes);
    const stockSum = (v) => {
      const invs = Array.isArray(v.branchInventories) ? v.branchInventories : null;
      if (!invs) return typeof v.stock === 'number' ? v.stock : 0;
      if (defaultBranchId) return invs.filter(bi => bi.branchId === defaultBranchId).reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
      return invs.reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
    };

    const match = variants.find((v) => {
      const va = normalize(v.attributes);
      const keys = new Set([...Object.keys(va), ...Object.keys(selected)]);
      for (const k of keys) {
        if ((va[k] || '') !== (selected[k] || '')) return false;
      }
      return true;
    });

    if (!match) {
      return res.status(404).json({ success: false, message: 'No matching variant found', data: null });
    }
    const computedStock = stockSum(match);
    const inStock = computedStock > 0;
    return res.json({
      success: true,
      data: {
        variantId: match.id,
        sku: match.sku,
        price: match.price,
        compareAtPrice: match.compareAtPrice ?? null,
        stock: computedStock,
        attributes: normalize(match.attributes),
        inStock,
      }
    });
  } catch (error) {
    next(error);
  }
};

// Adjust stock (add or deduct)
exports.adjustStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, reason } = req.body;
    const { tenantId } = req.user;
    const delta = Number(quantity);
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ success: false, message: 'quantity must be a non-zero number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const branch = await resolveBranchForUser(tx, {
        tenantId,
        user: req.user,
        branchId: req.headers['x-branch-id'],
        permission: 'inventory.adjust',
      });
      const { movement } = await applyMovementInTransaction(tx, {
        tenantId,
        branchId: branch.id,
        variantId: id,
        type: reason === 'damage' ? 'DAMAGE' : 'ADJUSTMENT',
        quantity: delta,
        idempotencyKey: req.get('Idempotency-Key') || `stock-adjustment:${randomUUID()}`,
        actorId: req.user.id,
        referenceType: 'MANUAL_ADJUSTMENT',
        note: typeof reason === 'string' ? reason : 'manual_adjustment',
      });
      await tx.inventoryAdjustment.create({
        data: {
          tenantId,
          branchId: branch.id,
          variantId: id,
          status: 'COMPLETED',
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'manual_adjustment',
          previousStock: movement.previousStock,
          countedStock: movement.newStock,
          delta,
          note: typeof reason === 'string' ? reason : null,
          createdBy: req.user.id,
          completedAt: new Date(),
          movementId: movement.id,
        },
      });
      return tx.variant.findUnique({ where: { id } });
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Low stock alert for a specific product
exports.getLowStock = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const { productId } = req.query;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId query parameter is required' });
    }

    // Verify product access
    await verifyProductAccess(productId, tenantId);

    const threshold = parseInt(req.query.threshold) || 5;
    const lowStockVariants = await prisma.variant.findMany({
      where: {
        productId,
        stock: { lte: threshold },
      },
    });
    res.json({ success: true, data: lowStockVariants });
  } catch (error) {
    next(error);
  }
};