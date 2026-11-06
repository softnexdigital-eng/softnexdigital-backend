const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification,
} = require("../controllers/notificationController");

router.use(protect);

router.get("/", getNotifications);
router.post("/", createNotification);
router.patch("/mark-all-read", markAllAsRead);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

module.exports = router;