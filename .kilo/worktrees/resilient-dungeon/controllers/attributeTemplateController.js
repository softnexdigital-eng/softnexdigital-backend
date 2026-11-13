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
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Check duplicate name for this tenant
    const existing = await prisma.attributeTemplate.findFirst({
      where: { tenantId, name, isActive: true },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Attribute "${name}" already exists` });
    }

    const template = await prisma.attributeTemplate.create({
      data: {
        tenantId,
        name,
        type: type || 'text',
        options: options || [],
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
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (options !== undefined) updateData.options = options;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await prisma.attributeTemplate.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete attribute template
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

    // Soft delete - just deactivate
    await prisma.attributeTemplate.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Attribute template deleted' });
  } catch (error) {
    next(error);
  }
};