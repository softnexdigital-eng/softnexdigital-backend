const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getUsers, toggleUserStatus, deleteUser } = require("../controllers/userController");

router.use(protect);

router.get("/", getUsers);
router.patch("/:id/toggle-status", toggleUserStatus);
router.delete("/:id", deleteUser);

module.exports = router;