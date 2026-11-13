const prisma = require('../models');

// List coupons
exports.listCoupons = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const coupons = await prisma.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: coupons });
  } catch (error) {
    next(error);
  }
};

// Get single coupon
exports.getCoupon = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const coupon = await prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

// Create coupon
exports.createCoupon = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { code, description, discountType, discountValue, minOrderAmount, maxDiscount, usageLimit, perUserLimit, startDate, endDate, isActive, applicableProducts, applicableCategories } = req.body;
    
    const coupon = await prisma.coupon.create({
      data: {
        tenantId,
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : undefined,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : undefined,
        usageLimit: usageLimit ? parseInt(usageLimit) : undefined,
        perUserLimit: perUserLimit ? parseInt(perUserLimit) : undefined,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : undefined,
        isActive: isActive !== undefined ? isActive : true,
        applicableProducts: applicableProducts || undefined,
        applicableCategories: applicableCategories || undefined,
      }
    });
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

// Update coupon
exports.updateCoupon = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const data = req.body;
    
    const existing = await prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Coupon not found' });
    
    if (data.discountValue) data.discountValue = parseFloat(data.discountValue);
    if (data.minOrderAmount) data.minOrderAmount = parseFloat(data.minOrderAmount);
    if (data.maxDiscount) data.maxDiscount = parseFloat(data.maxDiscount);
    if (data.usageLimit) data.usageLimit = parseInt(data.usageLimit);
    if (data.perUserLimit) data.perUserLimit = parseInt(data.perUserLimit);
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    if (data.code) data.code = data.code.toUpperCase();
    
    // Replace null with undefined for optional JSON fields
    if (data.applicableProducts === null) delete data.applicableProducts;
    if (data.applicableCategories === null) delete data.applicableCategories;
    if (data.minOrderAmount === null) delete data.minOrderAmount;
    if (data.maxDiscount === null) delete data.maxDiscount;
    if (data.usageLimit === null) delete data.usageLimit;
    if (data.perUserLimit === null) delete data.perUserLimit;
    if (data.endDate === null) delete data.endDate;
    
    const coupon = await prisma.coupon.update({ where: { id }, data });
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

// Toggle coupon active status
exports.toggleCouponStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const coupon = await prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    
    const updated = await prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive }
    });
    
    res.json({ 
      success: true, 
      data: updated,
      message: `Coupon ${updated.isActive ? 'activated' : 'deactivated'}`
    });
  } catch (error) {
    console.error('Toggle coupon error:', error);
    next(error);
  }
};

// Delete coupon
exports.deleteCoupon = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const existing = await prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Coupon not found' });
    
    await prisma.coupon.delete({ where: { id } });
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    next(error);
  }
};

// Validate coupon (public-facing - requires auth)
exports.validateCoupon = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { code, subtotal } = req.body;
    
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required' });
    
    const coupon = await prisma.coupon.findFirst({
      where: { tenantId, code: code.toUpperCase() }
    });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found', valid: false });
    }
    
    // Check if active
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: 'Coupon is inactive', valid: false });
    }
    
    // Check date range
    const now = new Date();
    if (now < coupon.startDate) {
      return res.status(400).json({ success: false, message: 'Coupon not yet valid', valid: false });
    }
    if (coupon.endDate && now > coupon.endDate) {
      return res.status(400).json({ success: false, message: 'Coupon has expired', valid: false });
    }
    
    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached', valid: false });
    }
    
    // Check per-user limit (if userId available)
    if (coupon.perUserLimit && req.user?.id) {
      const userUsageCount = await prisma.couponUsage.count({
        where: {
          couponId: coupon.id,
          customerId: req.user.id,
        }
      });
      if (userUsageCount >= coupon.perUserLimit) {
        return res.status(400).json({ success: false, message: 'You have already used this coupon the maximum number of times', valid: false });
      }
    }
    
    // Check min order amount
    if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Minimum order amount of ${coupon.minOrderAmount} required`, valid: false });
    }
    
// Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }
    
    res.json({
      success: true,
      valid: true,
      data: {
        coupon,
        discountAmount,
        subtotalAfterDiscount: subtotal - discountAmount,
      }
    });
  } catch (error) {
    next(error);
  }
};

// Validate coupon PUBLIC (no auth required - uses tenant from variant context)
exports.validateCouponPublic = async (req, res, next) => {
  try {
    const { code, subtotal, variantId } = req.body;
    
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required' });
    
    // Find the tenant from the variant's product
    let tenantId = req.body.tenantId;
    if (!tenantId && variantId) {
      const variant = await prisma.variant.findUnique({
        where: { id: variantId },
        include: { product: { select: { tenantId: true } } }
      });
      if (variant) tenantId = variant.product.tenantId;
    }
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Could not determine shop' });
    }
    
    const coupon = await prisma.coupon.findFirst({
      where: { tenantId, code: code.toUpperCase() }
    });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found', valid: false });
    }
    
    // Check if active
    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: 'Coupon is inactive', valid: false });
    }
    
    // Check date range
    const now = new Date();
    if (now < coupon.startDate) {
      return res.status(400).json({ success: false, message: 'Coupon not yet valid', valid: false });
    }
    if (coupon.endDate && now > coupon.endDate) {
      return res.status(400).json({ success: false, message: 'Coupon has expired', valid: false });
    }
    
    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit reached', valid: false });
    }
    
    // Check min order amount
    if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Minimum order amount of ${coupon.minOrderAmount} required`, valid: false });
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'PERCENTAGE') {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }
    
    res.json({
      success: true,
      valid: true,
      data: {
        coupon: { id: coupon.id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
        discountAmount,
        subtotalAfterDiscount: subtotal - discountAmount,
      }
    });
  } catch (error) {
    next(error);
  }
};
