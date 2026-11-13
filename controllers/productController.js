const prisma = require('../models');

// Helper to generate slug from name
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
}

// List all products (catalog style)
exports.listProducts = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { page = 1, limit = 50, category, brand, search, sort, minPrice, maxPrice, supplierId } = req.query;

    const where = { tenantId };
    if (category) {
      where.categories = { some: { categoryId: category } };
    }
    if (brand) {
      where.brandId = brand;
    }
    if (supplierId) {
      where.variants = {
        some: { supplierId }
      };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Price range filtering using variants
    if (minPrice || maxPrice) {
      const priceFilter = {
        some: {
          ...(minPrice ? { price: { gte: parseFloat(minPrice) } } : {}),
          ...(maxPrice ? { price: { lte: parseFloat(maxPrice) } } : {}),
        }
      };

      if (where.variants) {
        // Combine with existing variants filter using AND logic
        const existingVariantsFilter = where.variants;
        where.variants = {
          some: {
            AND: [
              existingVariantsFilter.some ? existingVariantsFilter.some : existingVariantsFilter,
              priceFilter.some
            ]
          }
        };
      } else {
        where.variants = priceFilter;
      }
    }

    let orderBy = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { basePrice: 'asc' };
    else if (sort === 'price_desc') orderBy = { basePrice: 'desc' };
    else if (sort === 'name') orderBy = { name: 'asc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };

    const products = await prisma.product.findMany({
      where,
      include: {
        variants: true,
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        brand: { select: { id: true, name: true, slug: true } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { variants: true } }
      },
      orderBy,
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });

    // Images now stored only in imagesRel, not JSON field
    const processed = products.map(p => ({
      ...p,
      images: p.imagesRel ? p.imagesRel.map(img => img.url) : [],
    }));

    const total = await prisma.product.count({ where });
    res.json({ success: true, data: { products: processed, total, page, limit } });
  } catch (error) {
    next(error);
  }
};

// Get single product
exports.getProduct = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { id } = req.params;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin does not have a tenant.' });
    }

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        variants: true,
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    // Images now stored only in imagesRel
    product.images = product.imagesRel ? product.imagesRel.map(img => img.url) : [];
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

// Create a new product
exports.createProduct = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin cannot create products directly.' });
    }

    const { name, description, basePrice, images, slug, metaTitle, metaDescription, metaKeywords, brandId, categoryIds } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    const product = await prisma.product.create({
      data: {
        tenantId,
        name,
        description,
        basePrice: basePrice ? parseFloat(basePrice) : null,
        slug: slug || generateSlug(name),
        metaTitle,
        metaDescription,
        metaKeywords,
        brandId: brandId || null,
        categories: categoryIds && categoryIds.length > 0 ? {
          create: categoryIds.map(catId => ({ categoryId: catId }))
        } : undefined,
        imagesRel: images && images.length > 0 ? {
          create: images.map((url, idx) => ({
            url,
            isPrimary: idx === 0,
            sortOrder: idx,
          }))
        } : undefined,
      },
      include: {
        categories: { include: { category: true } },
        brand: true,
        imagesRel: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      }
    });

    // Parse JSON images for backward compatibility (keep parsed value)
    // Note: we don't store 'images' JSON field anymore, only use imagesRel

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

// Update product
exports.updateProduct = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { id } = req.params;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin cannot update products.' });
    }

    const { name, description, basePrice, images, slug, metaTitle, metaDescription, metaKeywords, brandId, categoryIds } = req.body;

    const product = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (basePrice !== undefined) updateData.basePrice = basePrice ? parseFloat(basePrice) : null;
    if (slug) updateData.slug = slug;
    else if (name && !slug) updateData.slug = generateSlug(name);
    if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
    if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
    if (metaKeywords !== undefined) updateData.metaKeywords = metaKeywords;
    if (brandId !== undefined) updateData.brandId = brandId || null;

    // Handle category updates
    if (categoryIds !== undefined) {
      // Remove existing categories
      await prisma.productCategory.deleteMany({ where: { productId: product.id } });
      // Add new categories
      if (categoryIds.length > 0) {
        await prisma.productCategory.createMany({
          data: categoryIds.map(catId => ({ productId: product.id, categoryId: catId }))
        });
      }
    }

    // Handle image updates - only update imagesRel, not the JSON images field
    if (images !== undefined) {
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      if (images.length > 0) {
        await prisma.productImage.createMany({
          data: images.map((url, idx) => ({
            productId: product.id,
            url,
            isPrimary: idx === 0,
            sortOrder: idx,
          }))
        });
      }
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: updateData,
      include: {
        categories: { include: { category: true } },
        brand: true,
        imagesRel: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Delete product
exports.deleteProduct = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    const { id } = req.params;

    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin cannot delete products.' });
    }

    const product = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Get variant IDs and delete CartItem/Wishlist/VariantImage records first (foreign key constraint)
    const variants = await prisma.variant.findMany({
      where: { productId: product.id },
      select: { id: true },
    });
    const variantIds = variants.map(v => v.id);
    if (variantIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.wishlist.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.variantImage.deleteMany({ where: { variantId: { in: variantIds } } });
    }

    await prisma.product.delete({ where: { id: product.id } });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// Bulk delete products
exports.bulkDeleteProducts = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin cannot delete products.' });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs array is required' });
    }

    // Get all variant IDs for the products being deleted
    const variants = await prisma.variant.findMany({
      where: { productId: { in: ids }, product: { tenantId } },
      select: { id: true },
    });
    const variantIds = variants.map(v => v.id);

    if (variantIds.length > 0) {
      // Delete CartItem records referencing these variants (foreign key constraint)
      await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
      // Delete Wishlist records referencing these variants (foreign key constraint)
      await prisma.wishlist.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.variantImage.deleteMany({ where: { variantId: { in: variantIds } } });
    }

    const result = await prisma.product.deleteMany({
      where: { id: { in: ids }, tenantId },
    });

    res.json({ success: true, data: { deletedCount: result.count } });
  } catch (error) {
    next(error);
  }
};

// Bulk update categories for products
exports.bulkUpdateCategories = async (req, res, next) => {
  try {
    const { tenantId, role } = req.user;
    if (role === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super Admin cannot update products.' });
    }

    const { ids, categoryIds, action } = req.body;
    // action: 'replace' (default) or 'add'
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Product IDs array is required' });
    }

    for (const productId of ids) {
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
      if (!product) continue;

      if (action === 'add' && categoryIds) {
        // Add categories without removing existing ones
        const existingCats = await prisma.productCategory.findMany({
          where: { productId },
          select: { categoryId: true }
        });
        const existingIds = existingCats.map(c => c.categoryId);
        const newCats = categoryIds.filter(cid => !existingIds.includes(cid));
        if (newCats.length > 0) {
          await prisma.productCategory.createMany({
            data: newCats.map(catId => ({ productId, categoryId: catId }))
          });
        }
      } else {
        // Replace all categories
        await prisma.productCategory.deleteMany({ where: { productId } });
        if (categoryIds && categoryIds.length > 0) {
          await prisma.productCategory.createMany({
            data: categoryIds.map(catId => ({ productId, categoryId: catId }))
          });
        }
      }
    }

    res.json({ success: true, message: 'Categories updated' });
  } catch (error) {
    next(error);
  }
};