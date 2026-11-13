const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireBranchAccess } = require("../middleware/branchAuthorization");
const { getInventoryReport } = require("../controllers/inventoryOperationsController");

const router = express.Router();

router.use(protect);
router.get("/inventory", requireBranchAccess({ required: true }), getInventoryReport);

module.exports = router;
