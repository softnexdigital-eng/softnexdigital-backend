const prisma = require("../models");
const slugify = require("slugify");
const { applyMovementInTransaction } = require("../services/inventoryService");

// Helper: generate unique slug from tenant name
async function generateUniqueSlug(tenantName, tenantId) {
  let baseSlug = slugify(tenantName, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await prisma.landingPage.findUnique({ where: { slug } });
    if (!existing) break;
    slug = `${baseSlug}-${counter++}`;
  }
  return slug;
}

// Get tenant's landing page (for admin builder)
exports.getLandingPage = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "User has no tenant assigned" });
    }

    let page = await prisma.landingPage.findUnique({ where: { tenantId } });
    if (!page) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ success: false, message: "Tenant not found" });
      }
      const defaultTemplate = await prisma.template.findFirst({ where: { isActive: true } });
      const slug = await generateUniqueSlug(tenant.name, tenantId);
      const defaultSections = [
        { id: "hero", type: "hero", content: { title: "Welcome!", subtitle: "Your product here", ctaText: "Order Now" } },
        { id: "benefits", type: "benefits", content: { items: ["Premium Quality", "Fast Delivery", "Best Price"] } },
        { id: "order-form", type: "order-form", content: { title: "Order Now" } },
      ];
      const defaultStyles = { primaryColor: "#10b981", fontFamily: "'Hind Siliguri', sans-serif", background: "#f0fdf4" };
      page = await prisma.landingPage.create({
        data: {
          tenantId,
          templateId: defaultTemplate?.id || "default",
          title: tenant.name,
          slug,
          sections: defaultTemplate?.sections || defaultSections,
          styles: defaultTemplate?.styles || defaultStyles,
          seo: { title: tenant.name, description: "" },
          published: true,
        },
      });
    }
    res.json({ success: true, data: page });
  } catch (error) {
    next(error);
  }
};

// Update landing page (sections, styles, seo, title, slug, and new fields)
exports.updateLandingPage = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const {
      sections, styles, seo, title, slug,
      logoUrl, phoneNumber, phoneNumber2,
      emailAddress, address, socialLinks,
      termsContent, footerHtml, landingTheme,
    } = req.body;

    let page = await prisma.landingPage.findUnique({ where: { tenantId } });

    // Auto-create if not exists
    if (!page) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return res.status(404).json({ success: false, message: "Tenant not found" });
      }
      const defaultSections = [
        { id: "hero", type: "hero", content: { title: "Welcome!", subtitle: "Your product here", ctaText: "Order Now" } },
        { id: "benefits", type: "benefits", content: { items: ["Premium Quality", "Fast Delivery", "Best Price"] } },
        { id: "order-form", type: "order-form", content: { title: "Order Now" } },
      ];
      const newSlug = slug || (tenant.name.toLowerCase().replace(/[^a-z0-9-]/g, '') + '-' + tenantId.slice(0, 6));
      page = await prisma.landingPage.create({
        data: {
          tenantId,
          templateId: "default",
          title: title || tenant.name,
          slug: newSlug,
          sections: defaultSections,
          styles: { primaryColor: "#10b981" },
          seo: { title: tenant.name, description: "" },
          published: true,
        },
      });
    }

    // If slug is being changed, check uniqueness
    if (slug && slug !== page.slug) {
      const existing = await prisma.landingPage.findUnique({ where: { slug } });
      if (existing) {
        return res.status(400).json({ success: false, message: "Slug already in use. Please choose another." });
      }
    }

    const updateData = {};
    if (sections !== undefined) updateData.sections = sections;
    if (styles !== undefined) updateData.styles = styles;
    if (seo !== undefined) updateData.seo = seo;
    if (title !== undefined) updateData.title = title;
    if (slug !== undefined) updateData.slug = slug;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (phoneNumber2 !== undefined) updateData.phoneNumber2 = phoneNumber2;
    if (emailAddress !== undefined) updateData.emailAddress = emailAddress;
    if (address !== undefined) updateData.address = address;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    if (termsContent !== undefined) updateData.termsContent = termsContent;
    if (footerHtml !== undefined) updateData.footerHtml = footerHtml;
    if (landingTheme !== undefined) updateData.landingTheme = landingTheme;

    const updated = await prisma.landingPage.update({
      where: { tenantId },
      data: updateData,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Publish / unpublish
exports.publishLandingPage = async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { published } = req.body; // boolean
    const page = await prisma.landingPage.findUnique({ where: { tenantId } });
    if (!page) return res.status(404).json({ success: false, message: "Landing page not found" });
    const updated = await prisma.landingPage.update({
      where: { tenantId },
      data: {
        published,
        publishedAt: published ? new Date() : null,
      },
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// Get all templates
exports.getTemplates = async (req, res, next) => {
  try {
    const templates = await prisma.template.findMany({ where: { isActive: true } });
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

// Public: get landing page by slug
exports.getPublicLandingPage = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findFirst({
      where: { slug, published: true },
      include: { tenant: true },
    });
    if (!page) {
      return res.status(404).json({ success: false, message: "Page not found or not published" });
    }
    // Fetch ALL products for this tenant (was previously only fetching first product)
    const products = await prisma.product.findMany({
      where: { tenantId: page.tenantId },
      include: { 
        variants: {
          orderBy: { price: 'asc' },
          include: {
            variantImages: { orderBy: { sortOrder: 'asc' } },
            branchInventories: { select: { branchId: true, quantity: true } },
          },
        },
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        brand: { select: { id: true, name: true, slug: true } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // Fetch attribute templates for this tenant (for dynamic variant selectors)
    const attributeTemplates = await prisma.attributeTemplate.findMany({
      where: { tenantId: page.tenantId, isActive: true },
      select: { id: true, name: true, type: true, options: true },
      orderBy: { createdAt: 'asc' },
    });
    const attributeNames = attributeTemplates.map((t) => t.name);

    // Resolve default branch for stock
    const defaultBranch = await prisma.branch.findFirst({
      where: { tenantId: page.tenantId, isDefault: true, isActive: true },
      select: { id: true },
    });
    const defaultBranchId = defaultBranch?.id || null;

    const normalizeAttrs = (attrs) => {
      if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return {};
      const out = {};
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        let v = value;
        if (Array.isArray(v)) v = v.length ? v[0] : null;
        if (typeof v === 'string') {
          const t = v.trim();
          if (t.startsWith('[') && t.endsWith(']')) {
            try {
              const parsed = JSON.parse(t);
              if (Array.isArray(parsed)) v = parsed.length ? parsed[0] : null;
              else v = t;
            } catch { v = t; }
          } else v = t;
        }
        if (v == null) continue;
        out[String(key)] = String(v).trim();
      }
      return out;
    };
    const stockSum = (variant) => {
      const invs = Array.isArray(variant?.branchInventories) ? variant.branchInventories : null;
      if (!invs) return typeof variant?.stock === 'number' ? variant.stock : 0;
      if (defaultBranchId) return invs.filter((bi) => bi.branchId === defaultBranchId).reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
      return invs.reduce((s, bi) => s + (Number(bi.quantity) || 0), 0);
    };
    const toPublicVariant = (v) => ({
      id: v.id,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      stock: stockSum(v),
      image: v.image ?? null,
      attributes: normalizeAttrs(v.attributes),
    });

    // Fix: parse images for each product (backward compatibility)
    products.forEach(p => {
      if (p.images && typeof p.images === 'string') {
        try { p.images = JSON.parse(p.images); } catch(e) { p.images = []; }
      }
      // Merge imagesRel into the images array for frontend compatibility
      if (p.imagesRel && p.imagesRel.length > 0) {
        const relUrls = p.imagesRel.map(img => img.url);
        if (Array.isArray(p.images)) {
          relUrls.forEach(url => { if (!p.images.includes(url)) p.images.push(url); });
        } else {
          p.images = relUrls;
        }
      }
      delete p.imagesRel;
      p.attributeTemplates = attributeTemplates;
      p.attributeNames = attributeNames;
      if (Array.isArray(p.variants)) {
        p.variants = p.variants
          .filter(v => (v.status ?? true) !== false)
          .map(toPublicVariant);
      } else {
        p.variants = [];
      }
      // categories: keep shape but ensure safe
      if (Array.isArray(p.categories)) {
        p.categories = p.categories.map((pc) => pc.category ? { id: pc.category.id, name: pc.category.name } : pc).filter(Boolean);
      }
    });

    // Fetch categories for this tenant
    const categories = await prisma.category.findMany({
      where: { tenantId: page.tenantId, parentId: null },
      include: { children: true },
      orderBy: { name: 'asc' },
    });

    // Fetch banners for this tenant
    const banners = await prisma.banner.findMany({
      where: { tenantId: page.tenantId, isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    // Fetch brands for this tenant (with image)
    const brands = await prisma.brand.findMany({
      where: { tenantId: page.tenantId },
      orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          isActive: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
        },
    });

    // Auto-create default variants for products without variants
    // This ensures products without explicit variants still show on the landing page
    const productsNeedingDefaults = products.filter(p => !p.variants || p.variants.length === 0);
    for (const p of productsNeedingDefaults) {
      try {
        const defaultVariant = await prisma.$transaction(async (tx) => {
          const created = await tx.variant.create({
            data: {
              productId: p.id,
              sku: `default-${p.id.slice(0, 8)}`,
              attributes: { name: p.name },
              price: p.basePrice || 0,
              stock: 0,
              image: (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : null,
            },
          });
          const branch = await tx.branch.findFirst({
            where: { tenantId: page.tenantId, isDefault: true, isActive: true },
            select: { id: true },
          });
          if (!branch) throw new Error('No active default branch is configured for this shop');
          await applyMovementInTransaction(tx, {
            tenantId: page.tenantId,
            branchId: branch.id,
            variantId: created.id,
            type: 'OPENING_STOCK',
            quantity: 9999,
            idempotencyKey: `landing-default:${created.id}:opening-stock`,
            referenceType: 'LANDING_DEFAULT_VARIANT',
            referenceId: created.id,
            note: 'Default stock for legacy landing-page product',
          });
          return tx.variant.findUnique({ where: { id: created.id } });
        });
        p.variants = [defaultVariant];
      } catch (err) {
        // If SKU conflict (already exists), find existing default variant
        if (err.code === 'P2002') {
          const existing = await prisma.variant.findFirst({
            where: { productId: p.id, sku: `default-${p.id.slice(0, 8)}` },
          });
          if (existing) {
            p.variants = [existing];
          }
        } else {
          console.error(`Failed to create default variant for product ${p.id}:`, err.message);
        }
      }
    }

    // Re-fetch products that got new variants (to have complete data)
    if (productsNeedingDefaults.length > 0) {
      const refreshedProducts = await prisma.product.findMany({
        where: { tenantId: page.tenantId },
        include: { 
          variants: {
            orderBy: { price: 'asc' },
            include: {
              variantImages: { orderBy: { sortOrder: 'asc' } },
              branchInventories: { select: { branchId: true, quantity: true } },
            },
          },
          categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
          brand: { select: { id: true, name: true, slug: true } },
          imagesRel: { orderBy: { sortOrder: 'asc' } },
        },
      });
      // Replace products array with refreshed data
      products.length = 0;
      refreshedProducts.forEach(p => {
        if (p.images && typeof p.images === 'string') {
          try { p.images = JSON.parse(p.images); } catch(e) { p.images = []; }
        }
        if (p.imagesRel && p.imagesRel.length > 0) {
          const relUrls = p.imagesRel.map(img => img.url);
          if (Array.isArray(p.images)) {
            relUrls.forEach(url => { if (!p.images.includes(url)) p.images.push(url); });
          } else {
            p.images = relUrls;
          }
        }
        delete p.imagesRel;
        p.attributeTemplates = attributeTemplates;
        p.attributeNames = attributeNames;
        if (Array.isArray(p.variants)) {
          p.variants = p.variants
            .filter(v => (v.status ?? true) !== false)
            .map(toPublicVariant);
        } else {
          p.variants = [];
        }
        if (Array.isArray(p.categories)) {
          p.categories = p.categories.map((pc) => pc.category ? { id: pc.category.id, name: pc.category.name } : pc).filter(Boolean);
        }
        products.push(p);
      });
    }

    // Use first product as default/main product
    const mainProduct = products.length > 0 ? products[0] : null;
    if (mainProduct) {
      mainProduct.attributeTemplates = attributeTemplates;
      mainProduct.attributeNames = attributeNames;
    }

    res.json({
      success: true,
      data: {
        page,
        product: mainProduct,
        products,
        categories,
        brands,
        banners: banners.map(b => ({
          id: b.id,
          imageUrl: b.imageUrl,
          title: b.title,
          description: b.description,
          categoryId: b.categoryId,
          categoryName: b.category?.name || null,
          linkUrl: b.linkUrl,
          sortOrder: b.sortOrder
        })),
        tenant: {
          id: page.tenant.id,
          name: page.tenant.name,
          email: page.tenant.email,
          phone: page.tenant.phone,
          phone2: page.tenant.phone2,
          logo: page.tenant.logo,
          address: page.tenant.address,
          companyName: page.tenant.companyName,
          tenantEmail: page.tenant.tenantEmail,
          socialLinks: page.tenant.socialLinks || {},
          termsAndConditions: page.tenant.termsAndConditions || "",
          currency: page.tenant.currency,
          currencySymbol: page.tenant.currencySymbol,
          deliveryCharge: page.tenant.deliveryCharge || 0,
          productFeatures: page.tenant.productFeatures || {},
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Public: Get landing theme for the main landing page display
exports.getPublicLandingTheme = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const page = await prisma.landingPage.findFirst({
      where: { slug, published: true },
      select: { landingTheme: true },
    });
    res.json({
      success: true,
      data: { landingTheme: page?.landingTheme || 'original' }
    });
  } catch (error) {
    next(error);
  }
};