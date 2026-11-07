const prisma = require("../models");

/**
 * Get dashboard stats with enhanced reporting
 * GET /api/dashboard/stats
 */
const getStats = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      });
    }

    // SUPER_ADMIN check
    if (user.role === "SUPER_ADMIN") {
      const [totalProducts, totalOrders, totalTenants] = await Promise.all([
        prisma.product.count(),
        prisma.order.count(),
        prisma.tenant.count({ where: { status: "ACTIVE" } }),
      ]);

      const revenueAgg = await prisma.order.aggregate({
        _sum: { total: true },
      });

      const stats = {
        totalProducts,
        totalOrders,
        totalCustomers: totalTenants,
        totalRevenue: revenueAgg._sum.total || 0,
      };

      return res.status(200).json({
        success: true,
        data: stats,
      });
    }

    // BUSINESS_ADMIN / tenant user
    const { tenantId } = user;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "User has no tenant assigned.",
      });
    }

    // Run all queries in parallel
    const [
      totalProducts,
      totalOrders,
      uniqueCustomers,
      revenueAgg,
      recentOrders,
      monthlyRevenue,
      orderStatusCounts,
      topProducts,
      stockValueData,
      totalExpensesData,
      incompleteCheckoutCount,
      todayOrderCount,
    ] = await Promise.all([
      // Product count
      prisma.product.count({ where: { tenantId } }),
      // Order count
      prisma.order.count({ where: { tenantId } }),
      // Unique customers
      prisma.order.findMany({
        where: { tenantId },
        select: { customerPhone: true },
        distinct: ["customerPhone"],
      }),
      // Total revenue
      prisma.order.aggregate({
        where: { tenantId },
        _sum: { total: true },
      }),
      // Recent orders
      prisma.order.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
        },
      }),
      // Monthly revenue (last 6 months)
      prisma.$queryRaw`
        SELECT 
          TO_CHAR("createdAt", 'YYYY-MM') as month,
          SUM("total") as revenue
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month ASC
      `,
      // Order status breakdown
      prisma.$queryRaw`
        SELECT status, COUNT(*)::int as count
        FROM "Order"
        WHERE "tenantId" = ${tenantId}
        GROUP BY status
      `,
      // Top selling products (by order item quantity)
      prisma.$queryRaw`
        SELECT 
          v.sku,
          v.attributes,
          SUM(oi.quantity)::int as total_quantity,
          SUM(oi.total) as total_revenue
        FROM "OrderItem" oi
        JOIN "Variant" v ON v.id = oi."variantId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."tenantId" = ${tenantId}
        GROUP BY v.sku, v.attributes
        ORDER BY total_quantity DESC
        LIMIT 10
      `,
      // Stock value calculation
      prisma.variant.aggregate({
        where: { product: { tenantId } },
        _sum: { stock: true },
      }),
      // Total expenses
      prisma.expense.aggregate({
        where: { tenantId },
        _sum: { amount: true },
      }),
      // Incomplete checkout count
      prisma.order.count({
        where: { tenantId, isIncomplete: true },
      }),
      // Today's order count
      prisma.order.count({
        where: {
          tenantId,
          isIncomplete: false,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    // Calculate COGS (Cost of Goods Sold) from sold items
    const cogsData = await prisma.$queryRaw`
      SELECT SUM(v."costPrice" * oi.quantity) as cogs
      FROM "OrderItem" oi
      JOIN "Variant" v ON v.id = oi."variantId"
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."tenantId" = ${tenantId}
    `;
    const cogs = cogsData[0]?.cogs || 0;

    // Calculate stock value (stock * costPrice)
    const variants = await prisma.variant.findMany({
      where: { product: { tenantId } },
      select: { stock: true, costPrice: true },
    });
    const stockValue = variants.reduce((sum, v) => sum + (v.stock || 0) * (v.costPrice || 0), 0);
    const totalStockQty = variants.reduce((sum, v) => sum + (v.stock || 0), 0);

    const totalRevenue = revenueAgg._sum.total || 0;
    const totalExpenses = totalExpensesData._sum.amount || 0;
    const grossProfit = totalRevenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    // Low stock variants (<=5)
    const lowStockVariants = await prisma.variant.findMany({
      where: {
        product: { tenantId },
        stock: { lte: 5 },
      },
      select: { id: true, sku: true, stock: true, price: true },
      orderBy: { stock: 'asc' },
      take: 20,
    });

    const stats = {
      totalProducts,
      totalOrders,
      totalCustomers: uniqueCustomers.length,
      totalRevenue,
      recentOrders: recentOrders || [],
      monthlyRevenue: monthlyRevenue || [],
      // New fields
      totalExpenses,
      grossProfit,
      netProfit,
      cogs,
      stockValue,
      totalStockQty,
      orderStatusBreakdown: orderStatusCounts || [],
      topProducts: topProducts || [],
      lowStockVariants,
      profitMargin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0,
      // Anti-spam / Blocking dashboard fields
      incompleteCheckoutCount,
      todayOrderCount,
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard statistics.",
    });
  }
};

const getSuperAdminPageVisits = async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const where = req.query.slug ? { slug: String(req.query.slug) } : {};

    const [visits, total] = await Promise.all([
      prisma.pageVisit.findMany({
        where,
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.pageVisit.count({ where }),
    ]);

    res.json({
      success: true,
      data: { visits, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
};

const getSuperAdminNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const [notifications, unreadCount] = await Promise.all([
      prisma.superAdminNotification.findMany({
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.superAdminNotification.count({ where: { read: false } }),
    ]);

    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    next(error);
  }
};

const markSuperAdminNotificationAsRead = async (req, res, next) => {
  try {
    const notification = await prisma.superAdminNotification.findUnique({
      where: { id: req.params.id },
    });
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    await prisma.superAdminNotification.update({
      where: { id: notification.id },
      data: { read: true },
    });
    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
};

const markAllSuperAdminNotificationsAsRead = async (req, res, next) => {
  try {
    await prisma.superAdminNotification.updateMany({
      where: { read: false },
      data: { read: true },
    });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  getSuperAdminPageVisits,
  getSuperAdminNotifications,
  markSuperAdminNotificationAsRead,
  markAllSuperAdminNotificationsAsRead,
};