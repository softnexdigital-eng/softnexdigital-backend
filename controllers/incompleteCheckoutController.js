const prisma = require("../models");

/**
 * Save or update incomplete checkout data (called from frontend auto-save)
 * POST /api/public/incomplete-checkout/save
 */
exports.saveIncompleteCheckout = async (req, res, next) => {
  try {
    const {
      sessionId,
      tenantId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      notes,
      variantId,
      quantity,
      cartSessionId,
    } = req.body;

    if (!sessionId || !tenantId) {
      return res.status(400).json({
        success: false,
        message: "sessionId and tenantId are required",
      });
    }

    // Get client IP
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const userAgent = req.headers["user-agent"] || null;

    // Check if there's already an incomplete checkout for this session + tenant
    const existing = await prisma.incompleteCheckout.findFirst({
      where: { sessionId, tenantId },
    });

    if (existing) {
      // Update existing record
      const updated = await prisma.incompleteCheckout.update({
        where: { id: existing.id },
        data: {
          customerName: customerName ?? existing.customerName,
          customerPhone: customerPhone ?? existing.customerPhone,
          customerEmail: customerEmail ?? existing.customerEmail,
          customerAddress: customerAddress ?? existing.customerAddress,
          notes: notes ?? existing.notes,
          variantId: variantId ?? existing.variantId,
          quantity: quantity ?? existing.quantity,
          cartSessionId: cartSessionId ?? existing.cartSessionId,
          ipAddress: ipAddress ?? existing.ipAddress,
          userAgent: userAgent ?? existing.userAgent,
        },
      });
      return res.json({ success: true, data: updated });
    }

    // Create new record
    const created = await prisma.incompleteCheckout.create({
      data: {
        tenantId,
        sessionId,
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        notes,
        variantId,
        quantity: quantity ? Number(quantity) : null,
        cartSessionId,
        ipAddress,
        userAgent,
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

/**
 * List incomplete checkouts for a tenant (dashboard)
 * GET /api/incomplete-checkouts
 */
exports.listIncompleteCheckouts = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const {
      page = 1,
      limit = 20,
      search,
      startDate,
      endDate,
      hasData,
    } = req.query;

    const where = { tenantId };

    // Search by name, phone, email, IP
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search } },
        { customerEmail: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search } },
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Filter: only show entries that have at least some data filled
    if (hasData === "true") {
      where.OR = [
        { customerName: { not: null } },
        { customerPhone: { not: null } },
        { customerEmail: { not: null } },
        { customerAddress: { not: null } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.incompleteCheckout.findMany({
        where,
        orderBy: { lastUpdatedAt: "desc" },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.incompleteCheckout.count({ where }),
    ]);

    res.json({
      success: true,
      data: { items, total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single incomplete checkout detail
 * GET /api/incomplete-checkouts/:id
 */
exports.getIncompleteCheckout = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const item = await prisma.incompleteCheckout.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Not found" });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete an incomplete checkout record
 * DELETE /api/incomplete-checkouts/:id
 */
exports.deleteIncompleteCheckout = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const item = await prisma.incompleteCheckout.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Not found" });
    }

    await prisma.incompleteCheckout.delete({ where: { id } });

    res.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Get incomplete checkout stats for dashboard
 * GET /api/incomplete-checkouts/stats
 */
exports.getIncompleteCheckoutStats = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const [total, todayCount, withPhoneCount, withNameCount] =
      await Promise.all([
        prisma.incompleteCheckout.count({ where: { tenantId } }),
        prisma.incompleteCheckout.count({
          where: {
            tenantId,
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        prisma.incompleteCheckout.count({
          where: {
            tenantId,
            customerPhone: { not: null },
          },
        }),
        prisma.incompleteCheckout.count({
          where: {
            tenantId,
            customerName: { not: null },
          },
        }),
      ]);

    res.json({
      success: true,
      data: { total, todayCount, withPhoneCount, withNameCount },
    });
  } catch (error) {
    next(error);
  }
};