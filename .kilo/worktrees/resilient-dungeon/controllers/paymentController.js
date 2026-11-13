const prisma = require("../models");

// Business user submits payment (protected)
exports.submitPayment = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: "Transaction ID is required" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }

    // Already approved? can't submit again
    if (tenant.status === "ACTIVE") {
      return res.status(400).json({ success: false, message: "Your store is already active" });
    }

    // Already submitted pending? prevent duplicate
    if (tenant.paymentStatus === "PENDING" && tenant.transactionId) {
      return res.status(400).json({ success: false, message: "Payment already submitted. Wait for admin approval." });
    }

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: {
          transactionId,
          paymentMethod: "bkash",
          paymentAmount: 999,
          paymentStatus: "PENDING",
          paymentSubmittedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: req.user.id },
        data: { isPaymentSubmitted: true },
      }),
    ]);

    res.json({
      success: true,
      message: "Payment submitted. Admin will verify within 30 minutes. You will receive email notification.",
    });
  } catch (error) {
    next(error);
  }
};

// Super Admin: list all pending payments
exports.listPendingPayments = async (req, res, next) => {
  try {
    // Ensure only super admin
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const tenants = await prisma.tenant.findMany({
      where: { paymentStatus: "PENDING" },
      include: { users: { select: { email: true, id: true } } },
      orderBy: { paymentSubmittedAt: "asc" },
    });
    res.json({ success: true, data: tenants });
  } catch (error) {
    next(error);
  }
};

// Super Admin: approve payment
exports.approvePayment = async (req, res, next) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    if (tenant.paymentStatus !== "PENDING") {
      return res.status(400).json({ success: false, message: "Payment not pending or already processed" });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: "ACTIVE",
        paymentStatus: "PAID",
        approvedBy: req.user.id,
        approvedAt: new Date(),
      },
    });

    // Optionally send email to user (console log for now)
    const userEmail = tenant.users[0]?.email;
    console.log(`✅ Store approved for ${userEmail}. Tenant ID: ${tenantId}`);

    res.json({ success: true, message: "Payment approved. Store is now active." });
  } catch (error) {
    next(error);
  }
};

// Super Admin: reject payment
exports.rejectPayment = async (req, res, next) => {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Tenant not found" });
    }
    if (tenant.paymentStatus !== "PENDING") {
      return res.status(400).json({ success: false, message: "Payment not pending or already processed" });
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        paymentStatus: "REJECTED",
        // status remains PENDING_APPROVAL (or we can set to REJECTED? keep as is for now)
      },
    });

    const userEmail = tenant.users[0]?.email;
    console.log(`❌ Payment rejected for ${userEmail}. Tenant ID: ${tenantId}`);

    res.json({ success: true, message: "Payment rejected. User will be notified." });
  } catch (error) {
    next(error);
  }
};