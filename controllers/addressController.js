const prisma = require('../models');

// List addresses for a customer
exports.listAddresses = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { customerId } = req.params;
    
    const addresses = await prisma.address.findMany({
      where: { tenantId, customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    res.json({ success: true, data: addresses });
  } catch (error) {
    next(error);
  }
};

// Get single address
exports.getAddress = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const address = await prisma.address.findFirst({ where: { id, tenantId } });
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    res.json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
};

// Create address
exports.createAddress = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { customerId, label, recipientName, phone, addressLine1, addressLine2, city, state, postalCode, country, isDefault } = req.body;
    
    // If setting as default, unset other defaults first
    if (isDefault) {
      await prisma.address.updateMany({
        where: { tenantId, customerId, isDefault: true },
        data: { isDefault: false }
      });
    }
    
    const address = await prisma.address.create({
      data: {
        tenantId,
        customerId,
        label,
        recipientName,
        phone,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country: country || 'Bangladesh',
        isDefault: isDefault || false,
      }
    });
    res.status(201).json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
};

// Update address
exports.updateAddress = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const data = req.body;
    
    const existing = await prisma.address.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Address not found' });
    
    // If setting as default, unset other defaults for this customer
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { tenantId, customerId: existing.customerId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }
    
    const address = await prisma.address.update({ where: { id }, data });
    res.json({ success: true, data: address });
  } catch (error) {
    next(error);
  }
};

// Delete address
exports.deleteAddress = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const existing = await prisma.address.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Address not found' });
    
    await prisma.address.delete({ where: { id } });
    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    next(error);
  }
};