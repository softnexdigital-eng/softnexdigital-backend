const prisma = require("../models");

// List all customers for a tenant
exports.getCustomers = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;

    let customers;
    if (role === "SUPER_ADMIN") {
      customers = await prisma.customer.findMany({
        include: { tenant: { select: { name: true } } },
        orderBy: { lastOrderAt: "desc" },
      });
    } else {
      if (!tenantId) return res.status(400).json({ success: false, message: "No tenant" });
      customers = await prisma.customer.findMany({
        where: { tenantId },
        orderBy: { lastOrderAt: "desc" },
      });
    }

    const total = customers.length;
    const repeatCustomers = customers.filter(c => c.totalOrders > 1).length;

    res.json({ success: true, data: { customers, total, repeatCustomers } });
  } catch (error) {
    next(error);
  }
};

// Get single customer details with order history
exports.getCustomer = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          include: { items: { include: { variant: true } } },
        },
      },
    });

    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    res.json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
};

// Delete customer
exports.deleteCustomer = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    
    await prisma.customer.delete({ where: { id } });
    res.json({ success: true, message: "Customer deleted" });
  } catch (error) {
    next(error);
  }
};

// Get customer analytics
exports.getCustomerAnalytics = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) return res.status(400).json({ success: false, message: "No tenant" });

    const totalCustomers = await prisma.customer.count({ where: { tenantId } });
    const repeatCustomers = await prisma.customer.count({
      where: { tenantId, totalOrders: { gt: 1 } },
    });
    const newCustomers = await prisma.customer.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
      },
    });

    // Recent customers
    const recentCustomers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { lastOrderAt: "desc" },
      take: 5,
    });

    res.json({
      success: true,
      data: {
        totalCustomers,
        repeatCustomers,
        newCustomers,
        repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
        recentCustomers,
      },
    });
  } catch (error) {
    next(error);
  }
};