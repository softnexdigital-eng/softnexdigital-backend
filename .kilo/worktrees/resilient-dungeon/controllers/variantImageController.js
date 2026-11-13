const prisma = require('../models');

// List images for a variant
exports.getVariantImages = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { variantId } = req.query;

    if (!variantId) {
      return res.status(400).json({ success: false, message: 'variantId is required' });
    }

    const variant = await prisma.variant.findFirst({
      where: { id: variantId },
      include: { product: { select: { tenantId: true } } },
    });

    if (!variant || variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    const images = await prisma.variantImage.findMany({
      where: { variantId },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({ success: true, data: images });
  } catch (error) {
    next(error);
  }
};

// Add image to variant
exports.addVariantImage = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { variantId, url, altText, color, isPrimary, sortOrder } = req.body;

    if (!variantId || !url) {
      return res.status(400).json({ success: false, message: 'variantId and url are required' });
    }

    const variant = await prisma.variant.findFirst({
      where: { id: variantId },
      include: { product: { select: { tenantId: true } } },
    });

    if (!variant || variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }

    const image = await prisma.variantImage.create({
      data: {
        variantId,
        url,
        altText: altText || '',
        color: color || null,
        isPrimary: isPrimary || false,
        sortOrder: sortOrder || 0,
      },
    });

    res.status(201).json({ success: true, data: image });
  } catch (error) {
    next(error);
  }
};

// Update variant image
exports.updateVariantImage = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { id } = req.params;
    const { url, altText, color, isPrimary, sortOrder } = req.body;

    const image = await prisma.variantImage.findFirst({
      where: { id },
      include: { variant: { include: { product: { select: { tenantId: true } } } } },
    });

    if (!image || image.variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    const updated = await prisma.variantImage.update({
      where: { id },
      data: {
        ...(url !== undefined && { url }),
        ...(altText !== undefined && { altText }),
        ...(color !== undefined && { color }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete variant image
exports.deleteVariantImage = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { id } = req.params;

    const image = await prisma.variantImage.findFirst({
      where: { id },
      include: { variant: { include: { product: { select: { tenantId: true } } } } },
    });

    if (!image || image.variant.product.tenantId !== tenantId) {
      return res.status(404).json({ success: false, message: 'Image not found' });
    }

    await prisma.variantImage.delete({ where: { id } });
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    next(error);
  }
};