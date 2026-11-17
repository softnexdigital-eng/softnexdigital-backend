const prisma = require("../models");

/**
 * List all variants for a tenant with pre-order info
 * GET /api/dashboard/preorder/variants
 */
exports.listPreOrderVariants = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const variants = await prisma.variant.findMany({
      where: { product: { tenantId } },
      include: {
        product: { select: { id: true, name: true, slug: true, basePrice: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle variant as pre-order
 * PATCH /api/dashboard/preorder/variants/:id/toggle
 */
exports.toggleVariantPreOrder = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { isPreOrder } = req.body;

    const variant = await prisma.variant.findFirst({
      where: { id, product: { tenantId } },
    });
    if (!variant) {
      return res.status(404).json({ success: false, message: "Variant not found" });
    }

    const updated = await prisma.variant.update({
      where: { id },
      data: { isPreOrder: isPreOrder !== undefined ? isPreOrder : !variant.isPreOrder },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Update pre-order settings for a variant
 * PUT /api/dashboard/preorder/variants/:id
 */
exports.updatePreOrderSettings = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { isPreOrder, preOrderEstimatedDelivery, preOrderPrice } = req.body;

    const variant = await prisma.variant.findFirst({
      where: { id, product: { tenantId } },
    });
    if (!variant) {
      return res.status(404).json({ success: false, message: "Variant not found" });
    }

    const updateData = {};
    if (isPreOrder !== undefined) updateData.isPreOrder = isPreOrder;
    if (preOrderEstimatedDelivery !== undefined) updateData.preOrderEstimatedDelivery = preOrderEstimatedDelivery;
    if (preOrderPrice !== undefined) updateData.preOrderPrice = preOrderPrice ? parseFloat(preOrderPrice) : null;

    const updated = await prisma.variant.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * List all pre-order enabled variants
 * GET /api/dashboard/preorder/variants
 */
exports.listPreOrderEnabled = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const variants = await prisma.variant.findMany({
      where: {
        product: { tenantId },
        OR: [
          { isPreOrder: true },
          { preOrderPrice: { gt: 0 } },
        ],
      },
      include: {
        product: { select: { id: true, name: true, slug: true, basePrice: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, data: variants });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPreOrderVariants: exports.listPreOrderVariants,
  toggleVariantPreOrder: exports.toggleVariantPreOrder,
  updatePreOrderSettings: exports.updatePreOrderSettings,
  listPreOrderEnabled: exports.listPreOrderEnabled,
};