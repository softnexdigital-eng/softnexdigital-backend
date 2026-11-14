const prisma = require("../models");
const { createSuperAdminNotification } = require("../utils/superAdminNotifications");
const crypto = require("crypto");
const { sendNewOrderEmail } = require("../utils/emailService");
const { sendMetaEvent } = require("../utils/metaConversionsApi");
const {
  checkPhoneBlocked,
  checkIpBlocked,
  checkRepeatOrder,
  checkDailyLimit,
} = require("./blockingController");

const getPublicOrderTracking = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        status: true,
        deliveryStatus: true,
        courierStatus: true,
        createdAt: true,
        updatedAt: true,
        statusHistory: {
          select: { status: true, note: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    return res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Helper to parse images field
function parseImages(images) {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter((x) => typeof x === 'string' && x);
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string' && x) : [];
    } catch(e) { return []; }
  }
  return [];
}

// Normalize legacy attribute values to flat { key: "string" | string[] }
function normalizeVariantAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return {};
  const out = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      out[String(key)] = value.map(String).filter(Boolean);
      continue;
    }
    let v = value;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.startsWith('[') && t.endsWith(']')) {
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) {
            out[String(key)] = parsed.map(String).filter(Boolean);
            continue;
          }
          v = t;
        } catch { v = t; }
      } else {
        v = t;
      }
    }
    if (v == null) continue;
    out[String(key)] = String(v).trim();
  }
  return out;
}

function sumBranchInventory(variant, branchId) {
  const invs = Array.isArray(variant?.branchInventories) ? variant.branchInventories : null;
  if (!invs) return typeof variant?.stock === 'number' ? variant.stock : 0;
  if (branchId) {
    return invs.filter((bi) => bi.branchId === branchId).reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
  }
  return invs.reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
}

function toPublicVariant(v, branchId) {
  return {
    id: v.id,
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? null,
    stock: sumBranchInventory(v, branchId),
    image: v.image ?? null,
    attributes: normalizeVariantAttributes(v.attributes),
  };
}

function toPublicCategory(pc) {
  const c = pc?.category || pc;
  if (!c) return null;
  return { id: c.id, name: c.name };
}

function getAttributeValues(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return value == null ? [] : [String(value)];
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Treat malformed JSON as a plain attribute value.
    }
  }
  return trimmed.includes(",") ? trimmed.split(",").map((part) => part.trim()) : [trimmed];
}

function resolveOrderAttributes(variantAttributes, selectedAttributes) {
  if (selectedAttributes === undefined || selectedAttributes === null) {
    return { attributes: variantAttributes, error: null };
  }
  if (typeof selectedAttributes !== "object" || Array.isArray(selectedAttributes)) {
    return { attributes: null, error: "Selected attributes must be an object" };
  }

  const availableAttributes = variantAttributes && typeof variantAttributes === "object" && !Array.isArray(variantAttributes)
    ? variantAttributes
    : {};
  const unknownKey = Object.keys(selectedAttributes).find(
    (key) => !Object.prototype.hasOwnProperty.call(availableAttributes, key),
  );
  if (unknownKey) {
    return { attributes: null, error: `Invalid selected attribute: ${unknownKey}` };
  }

  const attributes = {};
  for (const [key, rawValue] of Object.entries(availableAttributes)) {
    const values = getAttributeValues(rawValue);
    const selectedValue = selectedAttributes[key];
    if (selectedValue === undefined || selectedValue === null || selectedValue === "") {
      if (values.length > 1) {
        return { attributes: null, error: `Please select a value for ${key}` };
      }
      attributes[key] = values.length === 1 ? values[0] : rawValue;
      continue;
    }

    const value = String(selectedValue);
    if (!values.includes(value)) {
      return { attributes: null, error: `Invalid value selected for ${key}` };
    }
    attributes[key] = value;
  }
  return { attributes, error: null };
}

/**
 * List all products publicly (e-commerce storefront)
 * GET /api/public/products
 */
const listPublicProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, search, sort, brand, minPrice, maxPrice, tenantSlug } = req.query;
    
    let tenantId = null;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findFirst({
        where: { 
          OR: [
            { slug: tenantSlug },
            { email: tenantSlug }
          ]
        },
        select: { id: true }
      });
      if (tenant) tenantId = tenant.id;
    }

    // Fetch attribute templates for this tenant (for storefront attribute selectors)
    let attributeTemplates = [];
    if (tenantId) {
      attributeTemplates = await prisma.attributeTemplate.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, type: true, options: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (category) {
      where.categories = { some: { categoryId: category } };
    }
    if (brand) {
      where.brandId = brand;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Price range filtering using variants
    if (minPrice || maxPrice) {
      where.variants = {
        some: {
          ...(minPrice ? { price: { gte: parseFloat(minPrice) } } : {}),
          ...(maxPrice ? { price: { lte: parseFloat(maxPrice) } } : {}),
        }
      };
    }
    
    let orderBy = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { basePrice: 'asc' };
    else if (sort === 'price_desc') orderBy = { basePrice: 'desc' };
    else if (sort === 'name') orderBy = { name: 'asc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };
    
    // Resolve default branch for stock (prefer tenant default branch)
    let defaultBranchId = null;
    if (tenantId) {
      const defBranch = await prisma.branch.findFirst({ where: { tenantId, isDefault: true, isActive: true }, select: { id: true } });
      defaultBranchId = defBranch?.id || null;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        variants: {
          orderBy: { price: 'asc' },
          include: { branchInventories: { select: { branchId: true, quantity: true } } },
        },
        categories: { include: { category: { select: { id: true, name: true } } } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy,
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    
    const processed = products.map(p => {
      const images = parseImages(p.images);
      if (Array.isArray(p.imagesRel)) {
        p.imagesRel.forEach(img => { if (img?.url && !images.includes(img.url)) images.push(img.url); });
      }
      const activeVariants = (p.variants || [])
        .filter(v => (v.status ?? true) !== false)
        .map(v => toPublicVariant(v, defaultBranchId));
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        images,
        categories: (p.categories || []).map(toPublicCategory).filter(Boolean),
        variants: activeVariants,
        attributeTemplates,
        attributeNames: attributeTemplates.map(t => t.name),
      };
    });

    const total = await prisma.product.count({ where });
    res.json({ success: true, data: { products: processed, total, page, limit, attributeTemplates } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single product by slug publicly
 * GET /api/public/products/slug/:slug
 */
const getPublicProductBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { tenantSlug } = req.query;

    let tenantId = null;
    if (tenantSlug) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { slug: tenantSlug },
            { email: tenantSlug }
          ]
        },
        select: { id: true }
      });
      if (tenant) tenantId = tenant.id;
    }

    // Fetch attribute templates for this tenant
    let attributeTemplates = [];
    if (tenantId) {
      attributeTemplates = await prisma.attributeTemplate.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, type: true, options: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    const whereProduct = { slug };
    if (tenantId) whereProduct.tenantId = tenantId;

    const product = await prisma.product.findFirst({
      where: whereProduct,
      include: {
        variants: {
          orderBy: { price: 'asc' },
          include: { branchInventories: { select: { branchId: true, quantity: true } } },
        },
        categories: { include: { category: { select: { id: true, name: true } } } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let defaultBranchId = null;
    if (product.tenantId) {
      const defBranch = await prisma.branch.findFirst({ where: { tenantId: product.tenantId, isDefault: true, isActive: true }, select: { id: true } });
      defaultBranchId = defBranch?.id || null;
    }

    const images = parseImages(product.images);
    if (Array.isArray(product.imagesRel)) {
      product.imagesRel.forEach(img => { if (img?.url && !images.includes(img.url)) images.push(img.url); });
    }
    const activeVariants = (product.variants || [])
      .filter(v => (v.status ?? true) !== false)
      .map(v => toPublicVariant(v, defaultBranchId));

    res.json({
      success: true,
      data: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        images,
        categories: (product.categories || []).map(toPublicCategory).filter(Boolean),
        variants: activeVariants,
        attributeTemplates,
        attributeNames: attributeTemplates.map(t => t.name),
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all categories publicly
 * GET /api/public/categories
 */
const listPublicCategories = async (req, res, next) => {
  try {
    const { tenantSlug } = req.query;
    
    let where = { parentId: null };
    if (tenantSlug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true }
      });
      if (tenant) {
        where = { ...where, tenantId: tenant.id };
      }
    }
    
    const categories = await prisma.category.findMany({
      where,
      include: { children: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/**
 * List all brands publicly
 * GET /api/public/brands
 */
const listPublicBrands = async (req, res, next) => {
  try {
    const { tenantSlug, categoryId } = req.query;
    
    let where = {};
    if (tenantSlug) {
      const tenant = await prisma.tenant.findFirst({
        where: { 
          OR: [
            { slug: tenantSlug },
            { email: tenantSlug }
          ]
        },
        select: { id: true }
      });
      if (tenant) {
        where = { tenantId: tenant.id };
      }
    }
    
    // If category specified, filter brands by category
    if (categoryId) {
      const productCategories = await prisma.productCategory.findMany({
        where: { categoryId },
        include: {
          product: {
            include: {
              brand: true
            }
          }
        }
      });
      
      // Filter by tenant if provided
      let productsInCategory = productCategories.map(pc => pc.product);
      if (tenantSlug) {
        const tenant = await prisma.tenant.findFirst({
          where: { 
            OR: [
              { slug: tenantSlug },
              { email: tenantSlug }
            ]
          },
          select: { id: true }
        });
        if (tenant) {
          productsInCategory = productsInCategory.filter(p => p.tenantId === tenant.id);
        }
      }
      
      // Extract unique brands from these products
      const brandsMap = new Map();
      productsInCategory.forEach(product => {
        if (product.brand && !brandsMap.has(product.brand.id)) {
          brandsMap.set(product.brand.id, product.brand);
        }
      });
      
      const brands = Array.from(brandsMap.values());
      return res.json({ success: true, data: brands });
    }
    
    const brands = await prisma.brand.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: brands });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a published dynamic page by slug
 * GET /api/public/page/:slug
 */
const getPublicPageBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const page = await prisma.page.findFirst({
      where: { slug, isPublished: true },
    });
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    res.json({ success: true, data: page });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new order from public landing page (no authentication)
 * POST /api/public/orders
 */
const createPublicOrder = async (req, res, next) => {
  try {
    const {
      variantId,
      quantity,
      customerName,
      customerPhone,
      customerAddress,
      customerEmail,
      notes,
      couponCode,
      discountAmount = 0,
      sessionId,
      marketingConsent,
      fbp,
      fbc,
      eventSourceUrl,
      attributes: selectedAttributes,
      selectedAttributes: selectedCartAttributes,
      paymentMethod,
    } = req.body;

    // ── Validation ──
    if (!customerName || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: customerName, customerPhone",
      });
    }

    // Validate: must have either (variantId + quantity) OR sessionId
    const isCartOrder = !!sessionId && !variantId;
    if (!isCartOrder && (!variantId || !quantity)) {
      return res.status(400).json({
        success: false,
        message: "Provide either variantId+quantity for single item, or sessionId to order from cart",
      });
    }

    // Phone number validation: must be exactly 11 digits (Bangladesh format)
    const cleanedPhone = customerPhone.replace(/[^0-9]/g, "");
    if (cleanedPhone.length !== 11) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be exactly 11 digits",
      });
    }

    // ── Resolve order items ──
    let orderItemsData = [];
    let tenant = null;
    let subtotal = 0;

    if (isCartOrder) {
      // === CART ORDER: load items from guest cart ===
      const cart = await prisma.cart.findFirst({
        where: { sessionId, userId: null },
        orderBy: { updatedAt: 'desc' },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: {
                    include: { tenant: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Cart is empty or not found",
        });
      }

      // All items must belong to the same tenant
      const firstTenant = cart.items[0].variant.product.tenant;
      const invalidItem = cart.items.find(item => item.variant.product.tenantId !== firstTenant.id);
      if (invalidItem) {
        return res.status(400).json({
          success: false,
          message: "All cart items must belong to the same shop",
        });
      }

      tenant = firstTenant;
      if (tenant.status !== "ACTIVE") {
        return res.status(400).json({ success: false, message: "This shop is currently inactive" });
      }

      // Validate stock for all items
      for (const cartItem of cart.items) {
        if (cartItem.variant.stock < cartItem.quantity) {
          const attrs = Object.values(cartItem.variant.attributes).join(", ");
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${cartItem.variant.product.name} — ${attrs}". Only ${cartItem.variant.stock} available.`,
          });
        }
        const lineTotal = cartItem.variant.price * cartItem.quantity;
        subtotal += lineTotal;
        const selected = selectedCartAttributes?.[cartItem.variantId];
        const resolved = resolveOrderAttributes(cartItem.variant.attributes, selected);
        if (resolved.error) {
          return res.status(400).json({ success: false, message: resolved.error });
        }
        orderItemsData.push({
          variantId: cartItem.variantId,
          skuAtTime: cartItem.variant.sku,
          attributes: resolved.attributes,
          quantity: cartItem.quantity,
          priceAtTime: cartItem.variant.price,
          total: lineTotal,
        });
      }
    } else {
      // === SINGLE ITEM ORDER (existing behavior) ===
      const variant = await prisma.variant.findUnique({
        where: { id: variantId },
        include: {
          product: {
            include: { tenant: true },
          },
        },
      });

      if (!variant) {
        return res.status(404).json({ success: false, message: "Invalid variant" });
      }

      if (!variant.product || !variant.product.tenant) {
        return res.status(500).json({ success: false, message: "Variant product or tenant missing" });
      }

      tenant = variant.product.tenant;
      if (tenant.status !== "ACTIVE") {
        return res.status(400).json({ success: false, message: "This shop is currently inactive" });
      }

      if (variant.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Only ${variant.stock} available.`,
        });
      }

      const resolved = resolveOrderAttributes(variant.attributes, selectedAttributes);
      if (resolved.error) {
        return res.status(400).json({ success: false, message: resolved.error });
      }
      subtotal = variant.price * quantity;
      orderItemsData.push({
        variantId: variant.id,
        skuAtTime: variant.sku,
        attributes: resolved.attributes,
        quantity,
        priceAtTime: variant.price,
        total: subtotal,
      });
    }

    // ── Anti-spam / Blocking Checks ──
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection.remoteAddress;

    if (tenant.enablePhoneBlock) {
      const phoneBlocked = await checkPhoneBlocked(tenant.id, cleanedPhone);
      if (phoneBlocked) {
        return res.status(403).json({
          success: false,
          message: "This phone number has been blocked. Please contact support.",
        });
      }
    }

    if (tenant.enableIpBlock && clientIp) {
      const ipBlocked = await checkIpBlocked(tenant.id, clientIp);
      if (ipBlocked) {
        return res.status(403).json({
          success: false,
          message: "Access denied from this location. Please contact support.",
        });
      }
    }

    if (tenant.enableRepeatBlock && tenant.repeatOrderBlockMinutes > 0) {
      const recentOrder = await checkRepeatOrder(tenant.id, cleanedPhone, tenant.repeatOrderBlockMinutes);
      if (recentOrder) {
        const blockPeriodMs = tenant.repeatOrderBlockMinutes * 60 * 1000;
        const elapsedMs = Date.now() - recentOrder.createdAt.getTime();
        const remainingMs = Math.max(0, blockPeriodMs - elapsedMs);
        const waitSeconds = Math.ceil(remainingMs / 1000);
        return res.status(429).json({
          success: false,
          message: `You have already placed an order. Please wait ${waitSeconds} second(s) before placing another order.`,
          data: { waitSeconds, lastOrderNumber: recentOrder.orderNumber },
        });
      }
    }

    if (tenant.enableRepeatBlock && tenant.maxOrdersPerDay > 0) {
      const limitReached = await checkDailyLimit(tenant.id, cleanedPhone, tenant.maxOrdersPerDay);
      if (limitReached) {
        return res.status(429).json({
          success: false,
          message: `Daily order limit reached (max ${tenant.maxOrdersPerDay} orders per day). Please try again tomorrow.`,
        });
      }
    }

    const deliveryCharge = tenant.deliveryCharge ? Number(tenant.deliveryCharge) : 0;
    const discount = Math.max(0, Number(discountAmount) || 0);

    // ── Coupon handling ──
    let coupon = null;
    if (couponCode && discount > 0) {
      coupon = await prisma.coupon.findFirst({
        where: { tenantId: tenant.id, code: couponCode.toUpperCase() },
      });
    }

    const total = subtotal + deliveryCharge - discount;

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { orderCounter: { increment: 1 } },
    });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const orderNumber = `ORD-${dateStr}-${String(updatedTenant.orderCounter).padStart(4, "0")}-${randomSuffix}`;

    const defaultBranch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, isDefault: true, isActive: true },
      select: { id: true },
    });
    if (!defaultBranch) {
      return res.status(409).json({ success: false, message: "No active default branch is configured for this shop" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId: tenant.id,
          branchId: defaultBranch.id,
          orderNumber,
          customerName,
          customerPhone: cleanedPhone,
          customerAddress,
          customerEmail,
          status: "PENDING",
          subtotal,
          deliveryCharge,
          discount,
          total,
          notes,
          ipAddress: clientIp || null,
          couponId: coupon?.id || null,
          paymentMethod: paymentMethod || "CASH_ON_DELIVERY",
          paymentStatus: (paymentMethod || "CASH_ON_DELIVERY") === "CASH_ON_DELIVERY" ? "UNPAID" : "PENDING",
          items: {
            create: orderItemsData,
          },
          statusHistory: {
            create: { status: "PENDING", changedBy: "system" },
          },
        },
      });

      // If cart order, clear the cart items after order creation
      if (isCartOrder) {
        const cart = await tx.cart.findFirst({
          where: { sessionId, tenantId: tenant.id, userId: null },
          orderBy: { updatedAt: 'desc' },
        });
        if (cart) {
          await tx.cartItem.deleteMany({
            where: { cartId: cart.id },
          });
        }
      }

      return order;
    });

    await createSuperAdminNotification({
      type: "NEW_ORDER",
      title: "New order received",
      message: `Order ${result.orderNumber} was placed for ${tenant.name}.`,
      entityId: result.id,
      tenantId: tenant.id,
    });

    if (marketingConsent === true) {
      try {
        const sourceUrl = eventSourceUrl || req.get("referer") || req.get("origin");
        if (!sourceUrl) {
          throw new Error("No storefront URL was provided for the Meta Purchase event");
        }
        const trackingOrder = await prisma.order.findUnique({
          where: { id: result.id },
          select: {
            id: true,
            total: true,
            items: {
              select: {
                quantity: true,
                priceAtTime: true,
                variant: { select: { productId: true } },
              },
            },
          },
        });
        const contents = trackingOrder.items.map(item => ({
          id: item.variant.productId,
          quantity: item.quantity,
          item_price: item.priceAtTime,
        }));
        await sendMetaEvent({
          tenantId: tenant.id,
          eventName: "Purchase",
          eventId: trackingOrder.id,
          eventSourceUrl: sourceUrl,
          userData: {
            email: customerEmail,
            phone: cleanedPhone,
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
            fbp,
            fbc,
          },
          customData: {
            value: trackingOrder.total,
            currency: tenant.currency,
            content_ids: [...new Set(contents.map(item => item.id))],
            content_type: "product",
            contents,
          },
        });
      } catch (trackingError) {
        console.error("Meta Purchase event delivery failed:", trackingError.message);
      }
    }

    // ── Update coupon usage count ──
    if (coupon) {
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          orderId: result.id,
          customerId: result.customerId || null,
        },
      });
    }

    // Customer tracking
    try {
      let customer = await prisma.customer.findFirst({
        where: { tenantId: tenant.id, phone: customerPhone },
      });
      if (customer) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: customerName,
            address: customerAddress || customer.address,
            email: customerEmail || customer.email,
            totalOrders: { increment: 1 },
            totalSpent: { increment: subtotal },
            lastOrderAt: new Date(),
          },
        });
        await prisma.order.update({
          where: { id: result.id },
          data: { customerId: customer.id },
        });
      } else {
        const customerCount = await prisma.customer.count({ where: { tenantId: tenant.id } });
        const customerIdStr = `CUST-${String(customerCount + 1).padStart(4, "0")}`;
        const newCustomer = await prisma.customer.create({
          data: {
            tenantId: tenant.id,
            customerId: customerIdStr,
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            email: customerEmail,
            totalOrders: 1,
            totalSpent: subtotal,
          },
        });
        await prisma.order.update({
          where: { id: result.id },
          data: { customerId: newCustomer.id },
        });
      }
    } catch (customerErr) {
      console.error("Customer tracking error (non-fatal):", customerErr.message);
    }

    // Send emails
    try { await sendNewOrderEmail(tenant.email, result); } catch (emailErr) {
      console.error("Failed to send order email:", emailErr.message);
    }
    if (customerEmail) {
      try {
        const fullOrder = await prisma.order.findUnique({
          where: { id: result.id },
          include: { items: { include: { variant: true } }, tenant: true },
        });
        const { sendInvoiceToCustomer } = require("../utils/emailService");
        await sendInvoiceToCustomer(customerEmail, fullOrder, tenant);
      } catch (emailErr) {
        console.error("Failed to send invoice email:", emailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        orderId: result.id,
        orderNumber: result.orderNumber,
      },
    });
  } catch (error) {
    console.error("Public order creation error:", error);
    next(error);
  }
};

/**
 * Track page view for landing page
 * POST /api/public/page-view/:slug
 */
const trackPageView = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findFirst({
      where: { slug, published: true },
    });
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }
    const [updatedPage] = await prisma.$transaction([
      prisma.landingPage.update({
        where: { id: page.id },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      }),
      prisma.pageVisit.create({
        data: { tenantId: page.tenantId, landingPageId: page.id, slug },
      }),
    ]);
    res.json({ success: true, data: { viewCount: updatedPage.viewCount } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get landing page stats (public version)
 * GET /api/public/page-stats/:slug
 */
const getPageStats = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findFirst({
      where: { slug, published: true },
      select: { viewCount: true },
    });
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found" });
    }
    res.json({ success: true, data: { viewCount: page.viewCount || 0 } });
  } catch (error) {
    next(error);
  }
};

/**
 * Track incomplete checkout
 * POST /api/public/incomplete-checkout
 */
const trackIncompleteCheckout = async (req, res, next) => {
  try {
    const { variantId, quantity, customerName, customerPhone, customerAddress, customerEmail, notes } = req.body;
    if (!variantId || !quantity || !customerName || !customerPhone) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: { product: { include: { tenant: true } } },
    });
    if (!variant || !variant.product || !variant.product.tenant) {
      return res.status(404).json({ success: false, message: "Invalid variant" });
    }
    const tenant = variant.product.tenant;
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { orderCounter: { increment: 1 } },
    });
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const orderNumber = `INC-${dateStr}-${String(updatedTenant.orderCounter).padStart(4, "0")}-${randomSuffix}`;
    const subtotal = variant.price * quantity;
    const deliveryCharge = tenant.deliveryCharge ? Number(tenant.deliveryCharge) : 0;
    const total = subtotal + deliveryCharge;
    const defaultBranch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, isDefault: true, isActive: true },
      select: { id: true },
    });
    if (!defaultBranch) {
      return res.status(409).json({ success: false, message: "No active default branch is configured for this shop" });
    }
    const result = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        branchId: defaultBranch.id,
        orderNumber,
        customerName,
        customerPhone: customerPhone.replace(/[^0-9]/g, ""),
        customerAddress,
        customerEmail,
        status: "PENDING",
        subtotal,
        deliveryCharge,
        discount: 0,
        total,
        notes,
        isIncomplete: true,
        items: {
          create: {
            variantId: variant.id,
            skuAtTime: variant.sku,
            attributes: variant.attributes,
            quantity,
            priceAtTime: variant.price,
            total: subtotal,
          },
        },
        statusHistory: {
          create: { status: "PENDING", changedBy: "system", note: "Incomplete checkout" },
        },
      },
    });
    res.status(201).json({
      success: true,
      data: { orderId: result.id, orderNumber: result.orderNumber },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add item to wishlist (guest user)
 * POST /api/public/wishlist/add
 */
const addToPublicWishlist = async (req, res, next) => {
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
      include: { product: { select: { tenantId: true, name: true } } }
    });
    
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    
    // Check if already in wishlist
    const existing = await prisma.wishlist.findFirst({
      where: { 
        variantId,
        sessionId,
        tenantId: variant.product.tenantId
      }
    });
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already in wishlist' });
    }
    
    // Add to wishlist
    const item = await prisma.wishlist.create({
      data: {
        tenantId: variant.product.tenantId,
        variantId,
        sessionId,
      },
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true } }
          }
        }
      }
    });
    
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove from public wishlist
 * DELETE /api/public/wishlist/remove/:variantId
 */
const removeFromPublicWishlist = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const sessionId = req.query.sessionId || req.body.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }
    
    // Find and delete
    const item = await prisma.wishlist.findFirst({
      where: {
        variantId,
        sessionId
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
const getPublicWishlist = async (req, res, next) => {
  try {
    const { sessionId, userId } = req.query;
    
    if (!sessionId && !userId) {
      return res.json({ success: true, data: [] });
    }
    
    const where = {};
    if (sessionId) where.sessionId = sessionId;
    if (userId) where.userId = userId;
    
    const items = await prisma.wishlist.findMany({
      where,
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

/**
 * Add item to cart (guest user)
 * POST /api/public/cart/add
 */
const publicCartInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: { select: { id: true, name: true, slug: true, images: true } },
        },
      },
    },
  },
};

const getGuestCart = async (sessionId, tenantId) => prisma.cart.findFirst({
  where: {
    sessionId,
    userId: null,
    ...(tenantId ? { tenantId } : {}),
  },
  orderBy: { updatedAt: 'desc' },
  include: publicCartInclude,
});

const addToCartPublic = async (req, res, next) => {
  try {
    const { variantId, quantity, sessionId } = req.body;

    if (!variantId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'variantId and sessionId required' 
      });
    }

    const itemQuantity = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isInteger(itemQuantity) || itemQuantity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive integer',
      });
    }
    
    // Verify variant exists
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      include: { product: { select: { tenantId: true } } }
    });
    
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    
    // Get or create cart for guest
    let cart = await prisma.cart.findFirst({
      where: { 
        tenantId: variant.product.tenantId,
        sessionId: sessionId.trim(),
        userId: null  // Guest cart
      },
      orderBy: { updatedAt: 'desc' },
      include: publicCartInclude,
    });
    
    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          tenantId: variant.product.tenantId,
          sessionId: sessionId.trim(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7 days
        },
        include: publicCartInclude,
      });
    }
    
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: {
        cartId: cart.id,
        variantId,
        quantity: itemQuantity,
      },
      update: { quantity: { increment: itemQuantity } },
    });

    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });
    
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: publicCartInclude,
    });
    
    res.json({ success: true, data: updatedCart });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove from cart (guest user)
 * DELETE /api/public/cart/remove/:variantId
 */
const removeFromCartPublic = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { sessionId } = req.query;
    
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }

    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: { product: { select: { tenantId: true } } },
    });
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    
    // Find cart and item
    const cart = await prisma.cart.findFirst({
      where: { sessionId: sessionId.trim(), tenantId: variant.product.tenantId, userId: null },
      orderBy: { updatedAt: 'desc' },
    });
    
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    const item = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } }
    });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }
    
    await prisma.cartItem.delete({ where: { id: item.id } });
    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });
    
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    next(error);
  }
};

/**
 * Update cart item quantity (guest user)
 * PUT /api/public/cart/update
 */
const updateCartPublic = async (req, res, next) => {
  try {
    const { variantId, quantity, sessionId } = req.body;
    
    if (typeof sessionId !== 'string' || !sessionId.trim() || !variantId) {
      return res.status(400).json({ success: false, message: 'sessionId and variantId required' });
    }
    
    const itemQuantity = Number(quantity);
    if (!Number.isInteger(itemQuantity)) {
      return res.status(400).json({ success: false, message: 'Quantity must be an integer' });
    }

    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: { product: { select: { tenantId: true } } },
    });
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found' });
    }
    
    // Find cart
    const cart = await prisma.cart.findFirst({
      where: { sessionId: sessionId.trim(), tenantId: variant.product.tenantId, userId: null },
      orderBy: { updatedAt: 'desc' },
    });
    
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    // Update item
    const item = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } }
    });
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not in cart' });
    }

    if (itemQuantity <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
      await prisma.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date() },
      });
      return res.json({ success: true, message: 'Item removed from cart' });
    }
    
    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: itemQuantity }
    });

    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });
    
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: publicCartInclude,
    });
    
    res.json({ success: true, data: updatedCart });
  } catch (error) {
    next(error);
  }
};

/**
 * Get cart (guest user)
 * GET /api/public/cart?sessionId=...
 */
const getCartPublic = async (req, res, next) => {
  try {
    const { sessionId, tenantId } = req.query;
    
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return res.status(400).json({ success: false, message: 'sessionId required' });
    }
    
    const cart = await getGuestCart(
      sessionId.trim(),
      typeof tenantId === 'string' ? tenantId : undefined,
    );
    
    if (!cart) {
      return res.status(200).json({ 
        success: true, 
        data: { id: 'temp', items: [], sessionId: sessionId.trim() }
      });
    }
    
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPublicOrder,
  getPublicOrderTracking,
  trackPageView,
  getPageStats,
  trackIncompleteCheckout,
  listPublicProducts,
  getPublicProductBySlug,
  listPublicCategories,
  listPublicBrands,
  getPublicPageBySlug,
  addToPublicWishlist,
  removeFromPublicWishlist,
  getPublicWishlist,
  addToCartPublic,
  removeFromCartPublic,
  updateCartPublic,
  getCartPublic,
};
