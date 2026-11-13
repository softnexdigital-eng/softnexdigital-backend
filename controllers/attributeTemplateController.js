const prisma = require('../models');

// Helper to check Super Admin
function checkSuperAdmin(role) {
  if (role === 'SUPER_ADMIN') {
    return { allowed: false, message: 'Super Admin cannot manage attributes. Please login as a Business Admin.' };
  }
  return { allowed: true };
}

// Get all attribute templates for tenant
exports.getTemplates = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const templates = await prisma.attributeTemplate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

// Get single template
exports.getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const template = await prisma.attributeTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Attribute template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

// Create attribute template
exports.createTemplate = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const sa = checkSuperAdmin(role);
    if (!sa.allowed) return res.status(403).json({ success: false, message: sa.message });

    const { name, type, options } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Duplicate name check (case-insensitive)
    const existing = await prisma.attributeTemplate.findFirst({
      where: { tenantId, name: { equals: name.trim(), mode: 'insensitive' }, isActive: true },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Attribute "${name.trim()}" already exists` });
    }

    if (options !== undefined && (!Array.isArray(options) || options.some((o) => typeof o !== 'string' || !o.trim()))) {
      return res.status(400).json({ success: false, message: 'Options must be an array of non-empty strings' });
    }

    const template = await prisma.attributeTemplate.create({
      data: {
        tenantId,
        name: name.trim(),
        type: (type && typeof type === 'string' ? type.trim() : 'text') || 'text',
        options: Array.isArray(options) ? options.map((o) => o.trim()).filter(Boolean) : [],
      },
    });

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

// Update attribute template
exports.updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { name, type, options, isActive } = req.body;

    const template = await prisma.attributeTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Attribute template not found' });
    }

    const updateData = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name must be a non-empty string' });
      }
      const existing = await prisma.attributeTemplate.findFirst({
        where: { tenantId, name: { equals: name.trim(), mode: 'insensitive' }, id: { not: id }, isActive: true },
      });
      if (existing) {
        return res.status(400).json({ success: false, message: `Attribute "${name.trim()}" already exists` });
      }
      updateData.name = name.trim();
    }
    if (type !== undefined) updateData.type = String(type).trim() || 'text';
    if (options !== undefined) {
      if (!Array.isArray(options) || options.some((o) => typeof o !== 'string' || !o.trim())) {
        return res.status(400).json({ success: false, message: 'Options must be an array of non-empty strings' });
      }
      updateData.options = options.map((o) => o.trim()).filter(Boolean);
    }
    if (isActive !== undefined) updateData.isActive = !!isActive;

    const updated = await prisma.attributeTemplate.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete attribute template (soft delete - set isActive to false)
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;

    const template = await prisma.attributeTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Attribute template not found' });
    }

    await prisma.attributeTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Attribute template deleted' });
  } catch (error) {
    next(error);
  }
};

// Add options to an attribute template
exports.addOptions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { options } = req.body;

    if (!Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ success: false, message: 'options must be a non-empty array' });
    }

    const template = await prisma.attributeTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Attribute template not found' });
    }

    const existingOptions = new Set((template.options || []).map((o) => String(o).toLowerCase().trim()));
    const newOptions = [];
    for (const opt of options) {
      const trimmed = String(opt).trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (existingOptions.has(lower)) {
        return res.status(400).json({ success: false, message: `Option "${trimmed}" already exists` });
      }
      existingOptions.add(lower);
      newOptions.push(trimmed);
    }

    if (newOptions.length === 0) {
      return res.status(400).json({ success: false, message: 'No new valid options to add' });
    }

    const updated = await prisma.attributeTemplate.update({
      where: { id },
      data: { options: [...(template.options || []), ...newOptions] },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Remove options from an attribute template
exports.removeOptions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.user;
    const { options } = req.body;

    if (!Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ success: false, message: 'options must be a non-empty array' });
    }

    const template = await prisma.attributeTemplate.findFirst({
      where: { id, tenantId },
    });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Attribute template not found' });
    }

    const currentOptions = template.options || [];
    const removeSet = new Set(options.map((o) => String(o).trim().toLowerCase()));
    const remaining = currentOptions.filter((o) => !removeSet.has(String(o).toLowerCase()));

    if (remaining.length === currentOptions.length) {
      return res.status(400).json({ success: false, message: 'None of the specified options were found' });
    }

    if (remaining.length === 0) {
      const updated = await prisma.attributeTemplate.update({
        where: { id },
        data: { options: [], isActive: false },
      });
      return res.json({ success: true, data: updated, message: 'All options removed, template deactivated' });
    }

    const updated = await prisma.attributeTemplate.update({
      where: { id },
      data: { options: remaining },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
