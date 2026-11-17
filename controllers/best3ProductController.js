const prisma = require("../models");

/**
 * List tenant's best-3 products
 * GET /api/dashboard/best3-products
 */
exports.listBest3Products = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const best3 = await prisma.best3Product.findMany({
      where: { tenantId, isActive: true },
      orderBy: { displayOrder: "asc" },
      include: {
        product: {
          include: {
            variants: true,
            brand: { select: { id: true, name: true } },
            imagesRel: { orderBy: { sortOrder: "asc" } },
          },
        },
        variant: true,
      },
    });
    res.json({ success: true, data: best3 });
  } catch (error) {
    next(error);
  }
};

/**
 * Upsert best-3 products (replaces entire list)
 * POST /api/dashboard/best3-products
 */
exports.setBest3Products = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { productIds } = req.body; // array of product ids, order matters

    if (!Array.isArray(productIds)) {
      return res.status(400).json({ success: false, message: "productIds array is required" });
    }

    if (productIds.length > 3) {
      return res.status(400).json({ success: false, message: "Maximum 3 best products allowed" });
    }

    // Verify all products belong to tenant
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      return res.status(400).json({ success: false, message: "Some products do not belong to this tenant" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.best3Product.deleteMany({ where: { tenantId } });
      for (let i = 0; i < productIds.length; i++) {
        await tx.best3Product.create({
          data: {
            tenantId,
            productId: productIds[i],
            displayOrder: i,
            isActive: true,
          },
        });
      }
    });

    res.json({ success: true, message: "Best 3 products updated" });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle best-3 product active state
 * PATCH /api/dashboard/best3-products/:id/toggle
 */
exports.toggleBest3Product = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { isActive } = req.body;

    const item = await prisma.best3Product.findFirst({ where: { id, tenantId } });
    if (!item) {
      return res.status(404).json({ success: false, message: "Best 3 product not found" });
    }

    const updated = await prisma.best3Product.update({
      where: { id },
      data: { isActive: isActive !== undefined ? isActive : !item.isActive },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete best-3 product
 * DELETE /api/dashboard/best3-products/:id
 */
exports.removeBest3Product = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const item = await prisma.best3Product.findFirst({ where: { id, tenantId } });
    if (!item) {
      return res.status(404).json({ success: false, message: "Best 3 product not found" });
    }

    await prisma.best3Product.delete({ where: { id } });
    res.json({ success: true, message: "Best 3 product removed" });
  } catch (error) {
    next(error);
  }
};
