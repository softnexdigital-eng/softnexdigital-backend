const prisma = require('../models');

// List categories (flat or tree)
exports.listCategories = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { tree } = req.query;
    
    const where = { tenantId };
    
    if (tree === 'true') {
      // Get only root categories with children
      const categories = await prisma.category.findMany({
        where: { ...where, parentId: null },
        include: {
          children: {
            include: {
              children: true
            }
          },
          _count: { select: { products: true } }
        },
        orderBy: { order: 'asc' }
      });
      return res.json({ success: true, data: categories });
    }
    
    const categories = await prisma.category.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        _count: { select: { products: true } }
      },
      orderBy: { order: 'asc' }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

// Get single category
exports.getCategory = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const category = await prisma.category.findFirst({
      where: { id, tenantId },
      include: {
        parent: true,
        children: { include: { children: { include: { children: true } } } },
        _count: { select: { products: true } }
      }
    });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

// Create category
exports.createCategory = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { name, slug, description, parentId, image, isActive, order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    // Auto-generate slug from name if not provided
    const finalSlug = slug?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check if slug already exists for this tenant before attempting creation
    const existingSlug = await prisma.category.findFirst({
      where: { tenantId, slug: finalSlug }
    });

    if (existingSlug) {
      return res.status(400).json({
        success: false,
        message: `A category with slug "${finalSlug}" already exists. Please use a different name or slug.`
      });
    }
    
    const category = await prisma.category.create({
      data: {
        tenantId,
        name: name.trim(),
        slug: finalSlug,
        description: description?.trim() || null,
        parentId: parentId || null,
        image: image?.trim() || null,
        isActive: isActive !== undefined ? isActive : true,
        order: order || 0,
      },
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
      return res.status(400).json({
        success: false,
        message: 'A category with this slug already exists. Please use a different name or slug.',
      });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'A category with this value already exists.',
      });
    }
    console.error('Category creation error:', {
      code: error.code,
      meta: error.meta,
      message: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Update category
exports.updateCategory = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, slug, description, parentId, image, isActive, order } = req.body;
    
    const existing = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found' });
    
    // Prevent setting parent to self or descendant
    if (parentId && parentId === id) {
      return res.status(400).json({ success: false, message: 'Cannot set category as its own parent' });
    }
    
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(image !== undefined && { image }),
        ...(isActive !== undefined && { isActive }),
        ...(order !== undefined && { order }),
      }
    });
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

// Delete category
exports.deleteCategory = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const category = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    
    // Check if has children
    const childrenCount = await prisma.category.count({ where: { parentId: id } });
    if (childrenCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete category with children. Remove children first.' });
    }
    
    await prisma.category.delete({ where: { id } });
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};