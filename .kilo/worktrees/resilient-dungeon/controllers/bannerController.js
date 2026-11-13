const prisma = require("../models");

// Create banner
exports.createBanner = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { imageUrl, title, description, categoryId, linkUrl, isActive, sortOrder } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: "Banner image URL is required" });
    }

    const banner = await prisma.banner.create({
      data: {
        tenantId,
        imageUrl,
        title: title || null,
        description: description || null,
        categoryId: categoryId || null,
        linkUrl: linkUrl || null,
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder || 0,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    res.json({ success: true, data: banner });
  } catch (error) {
    next(error);
  }
};

// Get all banners for tenant (authenticated - admin use)
exports.getBanners = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { activeOnly } = req.query;

    const where = { tenantId };
    if (activeOnly === 'true') {
      where.isActive = true;
    }

    const banners = await prisma.banner.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    res.json({ success: true, data: banners });
  } catch (error) {
    next(error);
  }
};

// Public: Get active banners for a tenant (no auth required)
exports.getPublicBanners = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const banners = await prisma.banner.findMany({
      where: { tenantId, isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    // Return only imageUrl, title, description, categoryId, linkUrl
    const simplifiedBanners = banners.map(banner => ({
      id: banner.id,
      imageUrl: banner.imageUrl,
      title: banner.title,
      description: banner.description,
      categoryId: banner.categoryId,
      categoryName: banner.category?.name || null,
      linkUrl: banner.linkUrl,
      sortOrder: banner.sortOrder
    }));

    res.json({ success: true, data: simplifiedBanners });
  } catch (error) {
    next(error);
  }
};

// Get categories for dropdown
exports.getCategoriesForBanner = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.json({ success: true, data: [] });
    }
    const categories = await prisma.category.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Error fetching categories for banner:', error);
    res.json({ success: true, data: [] });
  }
};

// Get single banner
exports.getBanner = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const banner = await prisma.banner.findFirst({
      where: { id, tenantId },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    if (!banner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    res.json({ success: true, data: banner });
  } catch (error) {
    next(error);
  }
};

// Update banner
exports.updateBanner = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { imageUrl, title, description, categoryId, linkUrl, isActive, sortOrder } = req.body;

    const existingBanner = await prisma.banner.findFirst({
      where: { id, tenantId }
    });

    if (!existingBanner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    const updateData = {};
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (linkUrl !== undefined) updateData.linkUrl = linkUrl;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    const updatedBanner = await prisma.banner.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    res.json({ success: true, data: updatedBanner });
  } catch (error) {
    next(error);
  }
};

// Delete banner
exports.deleteBanner = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const existingBanner = await prisma.banner.findFirst({
      where: { id, tenantId }
    });

    if (!existingBanner) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }

    await prisma.banner.delete({
      where: { id }
    });

    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (error) {
    next(error);
  }
};