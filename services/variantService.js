/**
 * Variant Service
 * Handles variant matching, variant CRUD, and combination generation.
 */
const prisma = require('../models');

const createVariantError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/**
 * Normalize selected attributes to a plain string map.
 */
function normalizeAttrsMap(attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return null;
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    out[String(k)] = String(v).trim();
  }
  return out;
}

/**
 * Check if variant attributes match selected attributes (exact key/value match).
 * Supports legacy array/JSON-string values stored in variant.attributes.
 */
function variantMatchesSelection(variantAttrs, selectedAttrs) {
  const va = variantAttrs && typeof variantAttrs === 'object' ? variantAttrs : {};
  for (const [key, value] of Object.entries(selectedAttrs)) {
    const vVal = va[key];
    if (vVal == null) return false;
    let values;
    if (Array.isArray(vVal)) values = vVal.map((x) => String(x).trim());
    else if (typeof vVal === 'string' && vVal.startsWith('[')) {
      try {
        const parsed = JSON.parse(vVal);
        values = Array.isArray(parsed) ? parsed.map((x) => String(x).trim()) : [String(vVal).trim()];
      } catch {
        values = [String(vVal).trim()];
      }
    } else {
      values = [String(vVal).trim()];
    }
    if (!values.includes(String(value).trim())) return false;
  }
  return true;
}

/**
 * Find an exact matching variant by product ID and selected attributes.
 * Verifies product/tenant ownership, active status, and stock.
 * Returns exact variant info; NEVER computes price from attributes.
 */
exports.findExactVariant = async (productId, selectedAttributes, tenantId) => {
  const selected = normalizeAttrsMap(selectedAttributes);
  if (!selected || Object.keys(selected).length === 0) {
    throw createVariantError('Selected attributes are required', 400);
  }

  const variants = await prisma.variant.findMany({
    where: {
      productId,
      status: true,
      ...(tenantId ? { product: { tenantId } } : {}),
    },
  });

  if (!variants || variants.length === 0) {
    throw createVariantError('No active variants found for this product', 404);
  }

  const match = variants.find((v) => variantMatchesSelection(v.attributes, selected));
  if (!match) {
    throw createVariantError('No matching variant found for selected attributes', 404);
  }

  if (match.stock <= 0) {
    throw createVariantError('Selected variant is out of stock', 400);
  }

  return {
    variantId: match.id,
    sku: match.sku,
    price: match.price,
    compareAtPrice: match.compareAtPrice || null,
    stock: match.stock,
    attributes: match.attributes,
  };
};

/**
 * Normalize and validate attributes from request body.
 */
exports.normalizeAttributes = (attrs, templateNames) => {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    throw createVariantError('Attributes must be an object');
  }

  const normalized = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw createVariantError(`Invalid value for attribute "${key}"`);
    }
    const strValue = String(value).trim();
    if (!strValue) {
      throw createVariantError(`Attribute "${key}" value cannot be empty`);
    }
    normalized[String(key).trim()] = strValue;
  }

  if (Array.isArray(templateNames) && templateNames.length > 0) {
    for (const name of templateNames) {
      if (!Object.prototype.hasOwnProperty.call(normalized, name)) {
        throw createVariantError(`Missing required attribute: ${name}`);
      }
    }
  }

  return normalized;
};

/**
 * Generate all valid combinations from selected options.
 * Does NOT overwrite existing variant prices, costs, or stock.
 */
exports.generateCombinations = (attributeTemplates, selectedOptions) => {
  if (!Array.isArray(attributeTemplates) || attributeTemplates.length === 0) return [];

  const templateNames = attributeTemplates.map((t) => t.name).filter(Boolean);
  const selected = selectedOptions && typeof selectedOptions === 'object' ? selectedOptions : {};

  const attrOptions = {};
  for (const tpl of attributeTemplates) {
    const name = tpl.name;
    const opts = Array.isArray(selected[name]) && selected[name].length > 0
      ? selected[name]
      : (Array.isArray(tpl.options) ? tpl.options : []);
    attrOptions[name] = opts
      .map((o) => (o == null ? '' : String(o).trim()))
      .filter(Boolean);
  }

  const templateNamesSorted = [...templateNames].sort();
  const entries = templateNamesSorted.map((name) => [name, attrOptions[name] || []]);
  if (entries.some(([, values]) => values.length === 0)) return [];

  const combinations = entries.reduce(
    (rows, [name, values]) => rows.flatMap((row) => values.map((value) => ({ ...row, [name]: value }))),
    [{}]
  );

  return combinations;
};

/**
 * Create a variant with proper validation.
 */
exports.createVariant = async (tenantId, productId, data) => {
  const { sku, price, compareAtPrice, costPrice, stock, attributes, image, status } = data || {};

  if (!sku || typeof sku !== 'string' || !sku.trim()) {
    throw createVariantError('SKU is required');
  }
  if (price === undefined || price === null || typeof price !== 'number' || Number.isNaN(price)) {
    throw createVariantError('Price is required and must be a number');
  }
  if (stock === undefined || stock === null || typeof stock !== 'number' || Number.isNaN(stock)) {
    throw createVariantError('Stock is required and must be a number');
  }

  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) throw createVariantError('Product not found or access denied', 404);

  const existingSku = await prisma.variant.findFirst({
    where: { productId, sku: { equals: sku.trim(), mode: 'insensitive' } },
  });
  if (existingSku) throw createVariantError(`SKU "${sku.trim()}" already exists for this product`, 409);

  return prisma.variant.create({
    data: {
      productId,
      sku: sku.trim(),
      price,
      compareAtPrice: compareAtPrice != null ? compareAtPrice : null,
      costPrice: costPrice != null ? costPrice : 0,
      stock,
      image: image || null,
      status: status !== undefined ? !!status : true,
      attributes: attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {},
    },
  });
};

/**
 * Update a variant. Preserves prices/cost/stock unless explicitly provided.
 */
exports.updateVariant = async (tenantId, id, data) => {
  const variant = await prisma.variant.findFirst({
    where: { id, product: { tenantId } },
  });
  if (!variant) throw createVariantError('Variant not found', 404);

  const { sku, price, compareAtPrice, costPrice, stock, image, status, attributes } = data || {};
  const updateData = {};

  if (sku !== undefined) {
    if (typeof sku !== 'string' || !sku.trim()) throw createVariantError('SKU must be a non-empty string');
    const existing = await prisma.variant.findFirst({
      where: { productId: variant.productId, sku: { equals: sku.trim(), mode: 'insensitive' }, id: { not: id } },
    });
    if (existing) throw createVariantError(`SKU "${sku.trim()}" already exists for this product`, 409);
    updateData.sku = sku.trim();
  }

  if (price !== undefined) {
    if (typeof price !== 'number' || Number.isNaN(price)) throw createVariantError('Price must be a number');
    updateData.price = price;
  }
  if (compareAtPrice !== undefined) {
    if (compareAtPrice !== null && (typeof compareAtPrice !== 'number' || Number.isNaN(compareAtPrice))) {
      throw createVariantError('Compare-at price must be a number or null');
    }
    updateData.compareAtPrice = compareAtPrice;
  }
  if (costPrice !== undefined) {
    if (costPrice !== null && (typeof costPrice !== 'number' || Number.isNaN(costPrice))) {
      throw createVariantError('Cost price must be a number or null');
    }
    updateData.costPrice = costPrice;
  }
  if (stock !== undefined) {
    if (typeof stock !== 'number' || Number.isNaN(stock)) throw createVariantError('Stock must be a number');
    updateData.stock = stock;
  }
  if (image !== undefined) updateData.image = image || null;
  if (status !== undefined) updateData.status = !!status;
  if (attributes !== undefined) {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      throw createVariantError('Attributes must be an object');
    }
    updateData.attributes = attributes;
  }

  if (Object.keys(updateData).length === 0) return variant;
  return prisma.variant.update({ where: { id }, data: updateData });
};

/**
 * Bulk update specific fields for all variants of given products (tenant-scoped).
 * Only updates fields explicitly provided.
 */
exports.bulkUpdateFields = async (tenantId, productIds, updates) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw createVariantError('productIds array is required');
  }
  const { price, costPrice, stock, status } = updates || {};
  const updateFields = {};
  if (price !== undefined) updateFields.price = price;
  if (costPrice !== undefined) updateFields.costPrice = costPrice;
  if (stock !== undefined) updateFields.stock = stock;
  if (status !== undefined) updateFields.status = status;
  if (Object.keys(updateFields).length === 0) throw createVariantError('No valid fields to update');

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true },
  });
  const allowedIds = new Set(products.map((p) => p.id));
  const filteredIds = productIds.filter((id) => allowedIds.has(id));
  if (filteredIds.length === 0) return { count: 0 };

  const result = await prisma.variant.updateMany({
    where: { productId: { in: filteredIds } },
    data: updateFields,
  });
  return result;
};

/**
 * Delete a variant (tenant-scoped).
 */
exports.deleteVariant = async (tenantId, id) => {
  const variant = await prisma.variant.findFirst({
    where: { id, product: { tenantId } },
  });
  if (!variant) throw createVariantError('Variant not found', 404);
  return prisma.variant.delete({ where: { id } });
};
