const prisma = require('../models');

// Get all expenses for tenant
exports.getExpenses = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(403).json({ success: false, message: 'No tenant found.' });
    }
    const { startDate, endDate, category } = req.query;
    const where = { tenantId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (category) where.category = category;

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    // Get total
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    res.json({ success: true, data: { expenses, total } });
  } catch (error) {
    next(error);
  }
};

// Create expense
exports.createExpense = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(403).json({ success: false, message: 'No tenant found.' });
    }
    const { category, amount, description, date } = req.body;
    if (!category || amount === undefined) {
      return res.status(400).json({ success: false, message: 'Category and amount are required' });
    }
    const expense = await prisma.expense.create({
      data: {
        tenantId,
        category,
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date(),
      },
    });
    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

// Update expense
exports.updateExpense = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { category, amount, description, date } = req.body;
    const existing = await prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(category !== undefined && { category }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(description !== undefined && { description }),
        ...(date !== undefined && { date: new Date(date) }),
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete expense
exports.deleteExpense = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const existing = await prisma.expense.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    await prisma.expense.delete({ where: { id } });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Get expense categories summary
exports.getExpenseSummary = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(403).json({ success: false, message: 'No tenant found.' });
    }
    const { startDate, endDate } = req.query;
    const where = { tenantId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const expenses = await prisma.expense.findMany({ where });
    const summary = {};
    for (const e of expenses) {
      summary[e.category] = (summary[e.category] || 0) + e.amount;
    }
    const categories = Object.entries(summary).map(([category, amount]) => ({ category, amount }));
    res.json({ success: true, data: { categories, total: expenses.reduce((s, e) => s + e.amount, 0) } });
  } catch (error) {
    next(error);
  }
};