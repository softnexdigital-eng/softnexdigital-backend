const prisma = require('../models');

// List wishlist items
exports.listWishlist = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const userId = req.user.id;
    
    const items = await prisma.wishlist.findMany({
      where: { tenantId, userId },
      include: { 
        variant: { 
          include: { 
            product: { select: { id: true, name: true, slug: true, images: true } }
          } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

// Add to wishlist
exports.addToWishlist = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const userId = req.user.id;
    const { variantId } = req.body;
    
    if (!variantId) return res.status(400).json({ success: false, message: 'variantId is required' });
    
    // Check variant exists
    const variant = await prisma.variant.findFirst({
      where: { id: variantId, product: { tenantId } }
    });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
    
    // Check if already in wishlist
    const existing = await prisma.wishlist.findUnique({
      where: { userId_variantId: { userId, variantId } }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Item already in wishlist' });
    }
    
    const item = await prisma.wishlist.create({
      data: { tenantId, userId, variantId }
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

// Remove from wishlist
exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const userId = req.user.id;
    const { id } = req.params;
    
    const item = await prisma.wishlist.findFirst({
      where: { id, tenantId, userId }
    });
    if (!item) return res.status(404).json({ success: false, message: 'Wishlist item not found' });
    
    await prisma.wishlist.delete({ where: { id } });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    next(error);
  }
};

// Migrate guest wishlist to authenticated user
exports.migrateWishlistToUser = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const userId = req.user.id;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    
    // Get guest wishlist items
    const guestItems = await prisma.wishlist.findMany({
      where: { sessionId, userId: null }
    });
    
    // Migrate to user
    let migratedCount = 0;
    for (const item of guestItems) {
      try {
        // Check if already in user's wishlist
        const existing = await prisma.wishlist.findUnique({
          where: { userId_variantId: { userId, variantId: item.variantId } }
        });
        
        if (!existing) {
          // Move to user's wishlist
          await prisma.wishlist.update({
            where: { id: item.id },
            data: { userId, sessionId: null }
          });
          migratedCount++;
        } else {
          // Already exists, just delete guest copy
          await prisma.wishlist.delete({ where: { id: item.id } });
        }
      } catch (itemErr) {
        console.warn('Failed to migrate wishlist item:', itemErr.message);
      }
    }
    
    res.json({ success: true, message: 'Wishlist migrated', data: { migratedCount } });
  } catch (error) {
    next(error);
  }
};

// ════════════════════════════════════════════════════════════
// PUBLIC WISHLIST ENDPOINTS (for guest users)
// ════════════════════════════════════════════════════════════

/**
 * Add to public wishlist (for guests)
 * POST /api/public/wishlist/add
 */
exports.addToPublicWishlist = async (req, res, next) => {
  try {
    const { variantId, sessionId } = req.body;
    
    if (!variantId) {
      return res.status(400).json({ success: false, message: 'variantId is required' });
    }
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    
    // Get variant to get tenant
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: { product: { select: { tenantId: true } } }
    });
    
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    
    // Check if already in wishlist
    const existing = await prisma.wishlist.findFirst({
      where: { 
        sessionId, 
        variantId,
        userId: null,
        tenantId: variant.product.tenantId
      }
    });
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'Item already in wishlist' });
    }
    
    const item = await prisma.wishlist.create({
      data: { 
        tenantId: variant.product.tenantId,
        variantId, 
        sessionId
      },
      include: {
        variant: {
          include: { product: { select: { id: true, name: true, slug: true } } }
        }
      }
    });
    
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove from public wishlist (for guests)
 * DELETE /api/public/wishlist/remove/:variantId
 */
exports.removeFromPublicWishlist = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    
    const item = await prisma.wishlist.findFirst({
      where: { 
        variantId,
        sessionId,
        userId: null
      }
    });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Wishlist item not found' });
    }
    
    await prisma.wishlist.delete({ where: { id: item.id } });
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get public wishlist (for guests)
 * GET /api/public/wishlist/:sessionId
 */
exports.getPublicWishlist = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    
    const items = await prisma.wishlist.findMany({
      where: { 
        sessionId,
        userId: null
      },
      include: { 
        variant: { 
          include: { 
            product: { select: { id: true, name: true, slug: true, images: true } }
          } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};