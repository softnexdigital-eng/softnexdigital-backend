/**
 * Attribute Service
 * Handles attribute template management with tenant isolation.
 */
const prisma = require('../models');

const createAttributeError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/**
 * Fetch available attribute templates for a tenant.
 */
exports.getTemplates = async (tenantId) => {
  return prisma.attributeTemplate.findMany({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
};

/**
 * Fetch a single attribute template by ID (tenant-scoped).
 */
exports.getTemplate = async (tenantId, id) => {
  return prisma.attributeTemplate.findFirst({ where: { id, tenantId } });
};

/**
 * Create an attribute template.
 * Validates duplicate names and empty options.
 */
exports.createTemplate = async (tenantId, name, type, options) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw createAttributeError('Name is required');
  }
  if (typeof type !== 'string' || !type.trim()) {
    type = 'text';
  }

  // Duplicate name check (case-insensitive)
  const existing = await prisma.attributeTemplate.findFirst({
    where: { tenantId, name: { equals: name.trim(), mode: 'insensitive' } },
  });
  if (existing) {
    throw createAttributeError(`Attribute "${name.trim()}" already exists`);
  }

  if (options !== undefined && (!Array.isArray(options) || options.some((o) => typeof o !== 'string' || !o.trim()))) {
    throw createAttributeError('Options must be an array of non-empty strings');
  }

  const template = await prisma.attributeTemplate.create({
    data: {
      tenantId,
      name: name.trim(),
      type: type.trim(),
      options: options || [],
    },
  });
  return template;
};

/**
 * Update an attribute template.
 * Validates duplicate names (excluding self) and option format.
 */
exports.updateTemplate = async (tenantId, id, updates) => {
  const template = await prisma.attributeTemplate.findFirst({ where: { id, tenantId } });
  if (!template) {
    throw createAttributeError('Attribute template not found');
  }

  const updateData = {};
  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || !updates.name.trim()) {
      throw createAttributeError('Name must be a non-empty string');
    }
    // Duplicate name check excluding self
    const existing = await prisma.attributeTemplate.findFirst({
      where: {
        tenantId,
        name: { equals: updates.name.trim(), mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (existing) {
      throw createAttributeError(`Attribute "${updates.name.trim()}" already exists`);
    }
    updateData.name = updates.name.trim();
  }

  if (updates.type !== undefined) {
    if (typeof updates.type !== 'string' || !updates.type.trim()) {
      throw createAttributeError('Type must be a non-empty string');
    }
    updateData.type = updates.type.trim();
  }

  if (updates.isActive !== undefined) {
    if (typeof updates.isActive !== 'boolean') {
      throw createAttributeError('isActive must be a boolean');
    }
    updateData.isActive = updates.isActive;
  }

  if (updates.options !== undefined) {
    if (!Array.isArray(updates.options) || updates.options.some((o) => typeof o !== 'string' || !o.trim())) {
      throw createAttributeError('Options must be an array of non-empty strings');
    }
    updateData.options = updates.options;
  }

  if (Object.keys(updateData).length === 0) {
    return template;
  }

  return prisma.attributeTemplate.update({
    where: { id },
    data: updateData,
  });
};

/**
 * Add one or more options to an existing attribute template.
 * Validates no duplicate options.
 */
exports.addOptions = async (tenantId, id, options) => {
  const template = await prisma.attributeTemplate.findFirst({ where: { id, tenantId } });
  if (!template) {
    throw createAttributeError('Attribute template not found');
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw createAttributeError('options must be a non-empty array');
  }

  // Check for duplicates within new options and existing
  const existingOptions = new Set((template.options || []).map((o) => o.toLowerCase().trim()));
  const newOptions = [];
  for (const opt of options) {
    const trimmed = opt.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (existingOptions.has(lower)) {
      throw createAttributeError(`Option "${trimmed}" already exists`);
    }
    existingOptions.add(lower);
    newOptions.push(trimmed);
  }

  if (newOptions.length === 0) {
    throw createAttributeError('No new valid options to add');
  }

  return prisma.attributeTemplate.update({
    where: { id },
    data: { options: [...(template.options || []), ...newOptions] },
  });
};

/**
 * Remove one or more options from an existing attribute template.
 */
exports.removeOptions = async (tenantId, id, options) => {
  const template = await prisma.attributeTemplate.findFirst({ where: { id, tenantId } });
  if (!template) {
    throw createAttributeError('Attribute template not found');
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw createAttributeError('options must be a non-empty array');
  }

  const currentOptions = template.options || [];
  const removeSet = new Set(options.map((o) => o.trim().toLowerCase()));
  const remaining = currentOptions.filter((o) => !removeSet.has(o.toLowerCase()));

  if (remaining.length === currentOptions.length) {
    throw createAttributeError('None of the specified options were found');
  }

  if (remaining.length === 0) {
    return prisma.attributeTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return prisma.attributeTemplate.update({
    where: { id },
    data: { options: remaining },
  });
};

/**
 * Check whether a template name is already in use by the tenant.
 */
exports.isNameDuplicate = async (tenantId, name, exceptId) => {
  const where = { tenantId, name: { equals: name, mode: 'insensitive' } };
  if (exceptId) where.id = { not: exceptId };
  const existing = await prisma.attributeTemplate.findFirst({ where });
  return !!existing;
};

/**
 * Find templates that have options used by existing variants.
 */
exports.getUsedOptionValues = async (tenantId, templateId) => {
  const template = await prisma.attributeTemplate.findFirst({
    where: { id: templateId, tenantId },
  });
  if (!template) return null;

  const variants = await prisma.variant.findMany({
    where: { productId: { not: undefined } },
    select: { attributes: true },
  });

  const usedValues = new Set();
  for (const v of variants) {
    const attrs = v.attributes && typeof v.attributes === 'object' ? v.attributes : {};
    if (Object.prototype.hasOwnProperty.call(attrs, template.name)) {
      const val = attrs[template.name];
      if (Array.isArray(val)) val.forEach((x) => usedValues.add(String(x)));
      else if (typeof val === 'string') usedValues.add(val);
      else if (val != null) usedValues.add(String(val));
    }
  }
  return Array.from(usedValues);
};


/**
 * Delete (soft-delete) an attribute template.
 * Sets isActive to false so existing variants keep working.
 */
exports.deleteTemplate = async (tenantId, id) => {
  const template = await prisma.attributeTemplate.findFirst({ where: { id, tenantId } });
  if (!template) {
    throw createAttributeError('Attribute template not found');
  }
  return prisma.attributeTemplate.update({
    where: { id },
    data: { isActive: false },
  });
};
