const prisma = require('../models');

// Get or create cart
async function getOrCreateCart(tenantId, sessionId, userId) {
  let cart;
  
  if (userId) {
    cart = await prisma.cart.findFirst({
      where: { tenantId, userId },
      include: { items: { include: { variant: true } } }
    });
  } else if (sessionId) {
    cart = await prisma.cart.findFirst({
      where: { tenantId, sessionId },
      include: { items: { include: { variant: true } } }
    });
  }
  
  if (!cart) {
    // Set expiry to 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    cart = await prisma.cart.create({
      data: {
        tenantId,
        sessionId: sessionId || null,
        userId: userId || null,
        expiresAt,
      },
      include: { items: { include: { variant: true } } }
    });
  }
  
  return cart;
}

// Get cart
exports.getCart = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { sessionId } = req.query;
    const userId = req.user?.id;
    
    const cart = await getOrCreateCart(tenantId, sessionId, userId);
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

// Add item to cart
exports.addItem = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { sessionId, variantId, quantity } = req.body;
    const userId = req.user?.id;
    
    if (!variantId) return res.status(400).json({ success: false, message: 'variantId is required' });
    
    // Verify variant exists and belongs to tenant
    const variant = await prisma.variant.findFirst({
      where: { id: variantId, product: { tenantId } }
    });
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
    
    const cart = await getOrCreateCart(tenantId, sessionId, userId);
    
    // Check if item already in cart
    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } }
    });
    
    if (existingItem) {
      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + (quantity || 1) }
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId,
          quantity: quantity || 1,
        }
      });
    }
    
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: { items: { include: { variant: true } } }
    });
    
    res.json({ success: true, data: updatedCart });
  } catch (error) {
    next(error);
  }
};

// Update item quantity
exports.updateItemQuantity = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { itemId } = req.params;
    const { quantity } = req.body;
    
    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }
    
    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cart: { tenantId } }
    });
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });
    
    const updated = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity }
    });
    
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Remove item from cart
exports.removeItem = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { itemId } = req.params;
    
    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cart: { tenantId } }
    });
    if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });
    
    await prisma.cartItem.delete({ where: { id: itemId } });
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    next(error);
  }
};

// Clear cart
exports.clearCart = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { sessionId } = req.query;
    const userId = req.user?.id;
    
    const where = { tenantId };
    if (userId) where.userId = userId;
    else if (sessionId) where.sessionId = sessionId;
    else return res.status(400).json({ success: false, message: 'sessionId or userId required' });
    
    const cart = await prisma.cart.findFirst({ where });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
};