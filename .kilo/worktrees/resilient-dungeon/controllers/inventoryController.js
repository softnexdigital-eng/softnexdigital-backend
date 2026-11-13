const prisma = require('../models');

// Helper to get tenant's product
async function getTenantProduct(tenantId) {
  const product = await prisma.product.findFirst({ where: { tenantId } });
  if (!product) throw new Error('No product found');
  return product;
}

// Get inventory logs with pagination & filtering
exports.getInventoryLogs = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { variantId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const product = await getTenantProduct(tenantId);

    const where = { variant: { productId: product.id } };
    if (variantId) where.variantId = variantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const logs = await prisma.inventoryLog.findMany({
      where,
      include: { variant: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.inventoryLog.count({ where });

    res.json({ success: true, data: { logs, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

// Variant-wise stock report
exports.getStockReport = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const product = await getTenantProduct(tenantId);
    const variants = await prisma.variant.findMany({
      where: { productId: product.id },
      include: {
        inventoryLogs: true,
      },
    });

    const report = variants.map(v => {
      const totalAdded = v.inventoryLogs.reduce((sum, log) => sum + (log.quantity > 0 ? log.quantity : 0), 0);
      const totalDeducted = v.inventoryLogs.reduce((sum, log) => sum + (log.quantity < 0 ? Math.abs(log.quantity) : 0), 0);
      return {
        variantId: v.id,
        sku: v.sku,
        attributes: v.attributes,
        currentStock: v.stock,
        totalAdded,
        totalDeducted,
      };
    });
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};