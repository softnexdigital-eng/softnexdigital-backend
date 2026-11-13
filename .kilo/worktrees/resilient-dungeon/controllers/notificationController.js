const prisma = require("../models");

// Get notifications for a tenant
exports.getNotifications = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "No tenant assigned" });
    }

    const notifications = await prisma.notification.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { tenantId, read: false },
    });

    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
exports.markAsRead = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId },
    });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    await prisma.notification.updateMany({
      where: { tenantId, read: false },
      data: { read: true },
    });

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

// Create notification (internal helper, also exposed as API)
exports.createNotification = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { title, message, type, link } = req.body;

    const notification = await prisma.notification.create({
      data: {
        tenantId,
        title,
        message,
        type: type || "info",
        link,
      },
    });

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    next(error);
  }
};

// Delete notification
exports.deleteNotification = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, tenantId },
    });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

    await prisma.notification.delete({ where: { id } });
    res.json({ success: true, message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
};