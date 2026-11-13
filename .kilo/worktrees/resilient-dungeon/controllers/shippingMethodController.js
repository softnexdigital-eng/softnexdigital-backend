const prisma = require('../models');

// List shipping methods
exports.listShippingMethods = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const methods = await prisma.shippingMethod.findMany({
      where: { tenantId },
      orderBy: { price: 'asc' }
    });
    res.json({ success: true, data: methods });
  } catch (error) {
    next(error);
  }
};

// Get single shipping method
exports.getShippingMethod = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const method = await prisma.shippingMethod.findFirst({ where: { id, tenantId } });
    if (!method) return res.status(404).json({ success: false, message: 'Shipping method not found' });
    res.json({ success: true, data: method });
  } catch (error) {
    next(error);
  }
};

// Create shipping method
exports.createShippingMethod = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, description, price, isActive, countries, zones } = req.body;
    
    const method = await prisma.shippingMethod.create({
      data: {
        tenantId,
        name,
        description,
        price: parseFloat(price),
        isActive: isActive !== undefined ? isActive : true,
        countries: countries || null,
        zones: zones || null,
      }
    });
    res.status(201).json({ success: true, data: method });
  } catch (error) {
    next(error);
  }
};

// Update shipping method
exports.updateShippingMethod = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const data = req.body;
    
    const existing = await prisma.shippingMethod.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Shipping method not found' });
    
    if (data.price) data.price = parseFloat(data.price);
    
    const method = await prisma.shippingMethod.update({ where: { id }, data });
    res.json({ success: true, data: method });
  } catch (error) {
    next(error);
  }
};

// Delete shipping method
exports.deleteShippingMethod = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const existing = await prisma.shippingMethod.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Shipping method not found' });
    
    await prisma.shippingMethod.delete({ where: { id } });
    res.json({ success: true, message: 'Shipping method deleted' });
  } catch (error) {
    next(error);
  }
};

// Calculate shipping price
exports.calculateShipping = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { methodId } = req.params;
    
    const method = await prisma.shippingMethod.findFirst({ where: { id: methodId, tenantId, isActive: true } });
    if (!method) return res.status(404).json({ success: false, message: 'Shipping method not found or inactive' });
    
    res.json({ success: true, data: { id: method.id, name: method.name, price: method.price } });
  } catch (error) {
    next(error);
  }
};