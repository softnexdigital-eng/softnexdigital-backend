const prisma = require("../models");

// List all users for a tenant
exports.getUsers = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;

    let users;
    if (role === "SUPER_ADMIN") {
      users = await prisma.user.findMany({
        include: { tenant: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
    } else {
      users = await prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
    }

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

// Block/unblock user
exports.toggleUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });

    res.json({
      success: true,
      message: updated.isActive ? "User activated" : "User blocked",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// Delete user
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    await prisma.user.delete({ where: { id } });
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};