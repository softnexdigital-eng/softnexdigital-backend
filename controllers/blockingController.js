const prisma = require("../models");

// ─── PHONE BLOCKING ─────────────────────────────────────────────

// Block a phone number
exports.blockPhone = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { phone, reason } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const existing = await prisma.blockedPhone.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "Phone is already blocked" });
    }

    const blocked = await prisma.blockedPhone.create({
      data: {
        tenantId,
        phone,
        reason: reason || "Blocked by admin",
        blockedBy: req.user.id,
      },
    });

    res.status(201).json({ success: true, data: blocked });
  } catch (error) {
    next(error);
  }
};

// Unblock a phone number
exports.unblockPhone = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { phone } = req.params;

    const existing = await prisma.blockedPhone.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Phone is not blocked" });
    }

    await prisma.blockedPhone.delete({
      where: { id: existing.id },
    });

    res.json({ success: true, message: "Phone unblocked successfully" });
  } catch (error) {
    next(error);
  }
};

// List blocked phones
exports.listBlockedPhones = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const blockedPhones = await prisma.blockedPhone.findMany({
      where: { tenantId },
      orderBy: { blockedAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.blockedPhone.count({ where: { tenantId } });

    res.json({ success: true, data: { blockedPhones, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

// ─── IP BLOCKING ────────────────────────────────────────────────

// Block an IP address
exports.blockIp = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { ip, reason } = req.body;

    if (!ip) {
      return res.status(400).json({ success: false, message: "IP address is required" });
    }

    const existing = await prisma.blockedIp.findUnique({
      where: { tenantId_ip: { tenantId, ip } },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "IP is already blocked" });
    }

    const blocked = await prisma.blockedIp.create({
      data: {
        tenantId,
        ip,
        reason: reason || "Blocked by admin",
        blockedBy: req.user.id,
      },
    });

    res.status(201).json({ success: true, data: blocked });
  } catch (error) {
    next(error);
  }
};

// Unblock an IP address
exports.unblockIp = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { ip } = req.params;

    const existing = await prisma.blockedIp.findUnique({
      where: { tenantId_ip: { tenantId, ip } },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "IP is not blocked" });
    }

    await prisma.blockedIp.delete({
      where: { id: existing.id },
    });

    res.json({ success: true, message: "IP unblocked successfully" });
  } catch (error) {
    next(error);
  }
};

// List blocked IPs
exports.listBlockedIps = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { page = 1, limit = 20 } = req.query;

    const blockedIps = await prisma.blockedIp.findMany({
      where: { tenantId },
      orderBy: { blockedAt: "desc" },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });
    const total = await prisma.blockedIp.count({ where: { tenantId } });

    res.json({ success: true, data: { blockedIps, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

// ─── REPEAT ORDER SETTINGS ──────────────────────────────────────

// Get repeat order blocking settings
exports.getBlockSettings = async (req, res, next) => {
  try {
    const { tenantId } = req.user;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        repeatOrderBlockMinutes: true,
        maxOrdersPerDay: true,
        enableRepeatBlock: true,
        enableIpBlock: true,
        enablePhoneBlock: true,
      },
    });

    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
};

// Update repeat order blocking settings
exports.updateBlockSettings = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const {
      repeatOrderBlockMinutes,
      maxOrdersPerDay,
      enableRepeatBlock,
      enableIpBlock,
      enablePhoneBlock,
    } = req.body;

    const updateData = {};
    if (repeatOrderBlockMinutes !== undefined) updateData.repeatOrderBlockMinutes = parseFloat(repeatOrderBlockMinutes);
    if (maxOrdersPerDay !== undefined) updateData.maxOrdersPerDay = parseInt(maxOrdersPerDay);
    if (enableRepeatBlock !== undefined) updateData.enableRepeatBlock = enableRepeatBlock;
    if (enableIpBlock !== undefined) updateData.enableIpBlock = enableIpBlock;
    if (enablePhoneBlock !== undefined) updateData.enablePhoneBlock = enablePhoneBlock;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      select: {
        repeatOrderBlockMinutes: true,
        maxOrdersPerDay: true,
        enableRepeatBlock: true,
        enableIpBlock: true,
        enablePhoneBlock: true,
      },
    });

    res.json({ success: true, data: updated, message: "Block settings updated" });
  } catch (error) {
    next(error);
  }
};

// ─── CHECK FUNCTIONS (used internally by order creation) ────────

/**
 * Check if a phone is blocked for a tenant
 */
exports.checkPhoneBlocked = async (tenantId, phone) => {
  const blocked = await prisma.blockedPhone.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
  return !!blocked;
};

/**
 * Check if an IP is blocked for a tenant
 */
exports.checkIpBlocked = async (tenantId, ip) => {
  const blocked = await prisma.blockedIp.findUnique({
    where: { tenantId_ip: { tenantId, ip } },
  });
  return !!blocked;
};

/**
 * Check if customer has a recent order within block period
 */
exports.checkRepeatOrder = async (tenantId, customerPhone, blockMinutes) => {
  const recentOrder = await prisma.order.findFirst({
    where: {
      tenantId,
      customerPhone,
      isIncomplete: false,
      createdAt: {
        gte: new Date(Date.now() - blockMinutes * 60 * 1000),
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return recentOrder;
};

/**
 * Check if customer has exceeded daily order limit
 */
exports.checkDailyLimit = async (tenantId, customerPhone, maxOrders) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orderCount = await prisma.order.count({
    where: {
      tenantId,
      customerPhone,
      isIncomplete: false,
      createdAt: { gte: today },
    },
  });

  return orderCount >= maxOrders;
};