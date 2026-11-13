const prisma = require("../models");

// List all couriers for a tenant
exports.listCouriers = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const couriers = await prisma.courier.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: couriers });
  } catch (error) {
    next(error);
  }
};

// Get single courier by ID
exports.getCourier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const courier = await prisma.courier.findFirst({
      where: { id, tenantId },
    });
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }
    res.json({ success: true, data: courier });
  } catch (error) {
    next(error);
  }
};

// Create courier
exports.createCourier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, apiKey, apiSecret, webhookUrl, isActive } = req.body;

    if (!name || !apiKey || !apiSecret) {
      return res.status(400).json({ success: false, message: "name, apiKey, and apiSecret are required" });
    }

    const courier = await prisma.courier.create({
      data: {
        tenantId,
        name,
        apiKey,
        apiSecret,
        webhookUrl: webhookUrl || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    res.status(201).json({ success: true, data: courier });
  } catch (error) {
    next(error);
  }
};

// Update courier
exports.updateCourier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, apiKey, apiSecret, webhookUrl, isActive } = req.body;

    const existing = await prisma.courier.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    const courier = await prisma.courier.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        apiKey: apiKey !== undefined ? apiKey : existing.apiKey,
        apiSecret: apiSecret !== undefined ? apiSecret : existing.apiSecret,
        webhookUrl: webhookUrl !== undefined ? webhookUrl : existing.webhookUrl,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    res.json({ success: true, data: courier });
  } catch (error) {
    next(error);
  }
};

// Delete courier
exports.deleteCourier = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const existing = await prisma.courier.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    await prisma.courier.delete({ where: { id } });
    res.json({ success: true, message: "Courier deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// Toggle courier active status
exports.toggleCourierStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const courier = await prisma.courier.findFirst({
      where: { id, tenantId },
    });
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    const updated = await prisma.courier.update({
      where: { id },
      data: { isActive: !courier.isActive },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};