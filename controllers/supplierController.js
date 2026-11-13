const prisma = require('../models');

// Get all suppliers for tenant
exports.getSuppliers = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      // For super admin, try to get from branch context or query param
      const branchId = req.query.branchId || req.headers['x-branch-id'];
      if (branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { tenantId: true },
        });
        if (branch) {
          const suppliers = await prisma.supplier.findMany({
            where: { tenantId: branch.tenantId },
            orderBy: { name: 'asc' },
          });
          return res.json({ success: true, data: suppliers });
        }
      }
      return res.status(403).json({ success: false, message: 'No tenant found.' });
    }
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
};

// Get single supplier
exports.getSupplier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId },
      include: { variants: true },
    });
    if (!supplier) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

// Create supplier
exports.createSupplier = async (req, res, next) => {
  try {
    let { tenantId } = req.user;
    if (!tenantId) {
      // For super admin, try to get from branch context
      const branchId = req.query.branchId || req.headers['x-branch-id'];
      if (branchId) {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { tenantId: true },
        });
        if (branch) tenantId = branch.tenantId;
      }
    }
    if (!tenantId) {
      return res.status(403).json({ success: false, message: 'No tenant found.' });
    }
    const { name, contactPerson, phone, email, address } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required' });
    }
    const supplier = await prisma.supplier.create({
      data: { tenantId, name, contactPerson, phone, email, address },
    });
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

// Update supplier
exports.updateSupplier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, contactPerson, phone, email, address, isActive } = req.body;
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete supplier
exports.deleteSupplier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const existing = await prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Supplier not found' });
    }
    // Unlink variants before deleting
    await prisma.variant.updateMany({
      where: { supplierId: id },
      data: { supplierId: null },
    });
    await prisma.supplier.delete({ where: { id } });
    res.json({ success: true, message: 'Supplier deleted successfully' });
  } catch (error) {
    next(error);
  }
};