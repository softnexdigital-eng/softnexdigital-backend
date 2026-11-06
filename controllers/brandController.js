const prisma = require('../models');

// List brands
exports.listBrands = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const brands = await prisma.brand.findMany({
      where: { tenantId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: brands });
  } catch (error) {
    next(error);
  }
};

// Get brand
exports.getBrand = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const brand = await prisma.brand.findFirst({
      where: { id, tenantId },
      include: { products: { select: { id: true, name: true, slug: true } } }
    });
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    res.json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

// Create brand
exports.createBrand = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, slug, logo, isActive } = req.body;
    
    const brand = await prisma.brand.create({
      data: { tenantId, name, slug, logo, isActive: isActive !== undefined ? isActive : true }
    });
    res.status(201).json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

// Update brand
exports.updateBrand = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const data = req.body;
    
    const existing = await prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Brand not found' });
    
    const brand = await prisma.brand.update({ where: { id }, data });
    res.json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

// Delete brand
exports.deleteBrand = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const existing = await prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Brand not found' });
    
    await prisma.brand.delete({ where: { id } });
    res.json({ success: true, message: 'Brand deleted' });
  } catch (error) {
    next(error);
  }
};