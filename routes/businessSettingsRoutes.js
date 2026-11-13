const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { requireTenantAdmin, requireTenantUser } = require("../middleware/businessAuthorization");
const { createBusinessFoundationController } = require("../controllers/businessFoundationController");
const prisma = require("../models");

const controller = createBusinessFoundationController(prisma);
const router = express.Router();

router.use(protect, requireTenantUser);
router.get("/", controller.getBusinessSettings);
router.put("/", requireTenantAdmin, controller.updateBusinessSettings);

module.exports = router;
