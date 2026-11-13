const express = require("express");
const router = express.Router();
const { protect, isSuperAdmin } = require("../middleware/authMiddleware");
const {
  getStats,
  getSuperAdminPageVisits,
  getSuperAdminNotifications,
  markSuperAdminNotificationAsRead,
  markAllSuperAdminNotificationsAsRead,
} = require("../controllers/dashboardController");

/**
 * Dashboard Routes
 * Base path: /api/dashboard
 */

// GET /api/dashboard/stats - Get dashboard statistics (protected)
router.get("/stats", protect, getStats);
router.get("/super-admin/page-visits", protect, isSuperAdmin, getSuperAdminPageVisits);
router.get("/super-admin/notifications", protect, isSuperAdmin, getSuperAdminNotifications);
router.patch("/super-admin/notifications/mark-all-read", protect, isSuperAdmin, markAllSuperAdminNotificationsAsRead);
router.patch("/super-admin/notifications/:id/read", protect, isSuperAdmin, markSuperAdminNotificationAsRead);

module.exports = router;
