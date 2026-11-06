const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getCustomers,
  getCustomer,
  deleteCustomer,
  getCustomerAnalytics,
} = require("../controllers/customerController");

router.use(protect);

router.get("/", getCustomers);
router.get("/analytics", getCustomerAnalytics);
router.get("/:id", getCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;