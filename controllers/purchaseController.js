const {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrder,
  submitPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  createSupplierPayment,
  listSupplierPayments,
  getSupplierLedger,
} = require("../services/purchaseService");
const prisma = require("../models");

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const inTransaction = (operation, input) =>
  prisma.$transaction((tx) => operation(tx, input));

const parsePagination = (query) => {
  const page = Number.parseInt(query.page || "1", 10);
  const limit = Number.parseInt(query.limit || "20", 10);
  if (!Number.isInteger(page) || page < 1) fail(400, "page must be a positive integer");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, "limit must be between 1 and 100");
  return { page, limit, skip: (page - 1) * limit };
};

const parseDateRange = (query, field = "createdAt") => {
  const range = {};
  if (query.startDate) {
    range.gte = new Date(query.startDate);
    if (Number.isNaN(range.gte.getTime())) fail(400, "startDate must be a valid date");
  }
  if (query.endDate) {
    range.lte = new Date(query.endDate);
    if (Number.isNaN(range.lte.getTime())) fail(400, "endDate must be a valid date");
  }
  if (range.gte && range.lte && range.gte > range.lte) {
    fail(400, "startDate must be before endDate");
  }
  return Object.keys(range).length ? { [field]: range } : undefined;
};

const getAuthorizedBranchId = (req, requestedBranchId) => {
  const authorizedBranchId = req.branch?.id;
  if (authorizedBranchId && requestedBranchId && requestedBranchId !== authorizedBranchId) {
    fail(403, "Requested branch does not match the authorized branch");
  }
  return authorizedBranchId || requestedBranchId;
};

exports.createPurchaseOrder = async (req, res, next) => {
  try {
    const { supplierId, branchId, items, notes, expectedAt } = req.body || {};
    if (!supplierId) fail(400, "supplierId is required");
    if (!items?.length) fail(400, "At least one item is required");

    const result = await inTransaction(createPurchaseOrder, {
      tenantId: req.user.tenantId,
      user: req.user,
      supplierId,
      branchId: getAuthorizedBranchId(req, branchId),
      items,
      notes,
      expectedAt,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.listPurchaseOrders = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const dateRange = parseDateRange(req.query);
    const { status, supplierId, branchId } = req.query;

    const result = await listPurchaseOrders(prisma, {
      tenantId: req.user.tenantId,
      page,
      limit,
      status,
      supplierId,
      branchId: getAuthorizedBranchId(req, branchId),
      startDate: dateRange?.createdAt?.gte,
      endDate: dateRange?.createdAt?.lte,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getPurchaseOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await getPurchaseOrder(prisma, {
      tenantId: req.user.tenantId,
      id,
      branchId: req.branch?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.updatePurchaseOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supplierId, branchId, items, notes, expectedAt } = req.body || {};

    const result = await inTransaction(updatePurchaseOrder, {
      tenantId: req.user.tenantId,
      id,
      user: req.user,
      branchId: req.branch?.id,
      data: { supplierId, branchId, items, notes, expectedAt },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.submitPurchaseOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await inTransaction(submitPurchaseOrder, {
      tenantId: req.user.tenantId,
      id,
      user: req.user,
      branchId: req.branch?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.cancelPurchaseOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await inTransaction(cancelPurchaseOrder, {
      tenantId: req.user.tenantId,
      id,
      user: req.user,
      branchId: req.branch?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.receivePurchaseOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { items, notes } = req.body || {};
    if (!items?.length) fail(400, "At least one receipt item is required");

    const result = await inTransaction(receivePurchaseOrder, {
      tenantId: req.user.tenantId,
      user: req.user,
      purchaseOrderId: id,
      branchId: req.branch?.id,
      items,
      notes,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.createSupplierPayment = async (req, res, next) => {
  try {
    const { supplierId, purchaseOrderId, amount, method, reference, notes, paidAt } = req.body || {};
    if (!supplierId) fail(400, "supplierId is required");
    if (!Number.isFinite(amount) || amount <= 0) fail(400, "amount must be a positive number");
    if (!method) fail(400, "payment method is required");

    const result = await inTransaction(createSupplierPayment, {
      tenantId: req.user.tenantId,
      user: req.user,
      supplierId,
      purchaseOrderId,
      amount,
      method,
      reference,
      notes,
      paidAt,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.listSupplierPayments = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const dateRange = parseDateRange(req.query, "paidAt");
    const { supplierId, purchaseOrderId } = req.query;

    const result = await listSupplierPayments(prisma, {
      tenantId: req.user.tenantId,
      page,
      limit,
      supplierId,
      purchaseOrderId,
      startDate: dateRange?.paidAt?.gte,
      endDate: dateRange?.paidAt?.lte,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getSupplierLedger = async (req, res, next) => {
  try {
    const { supplierId } = req.params;
    const dateRange = parseDateRange(req.query, "paidAt");

    const result = await getSupplierLedger(prisma, {
      tenantId: req.user.tenantId,
      supplierId,
      startDate: dateRange?.paidAt?.gte,
      endDate: dateRange?.paidAt?.lte,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};