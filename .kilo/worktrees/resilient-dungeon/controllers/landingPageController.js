const prisma = require("../models");
const slugify = require("slugify");

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
        variants: { include: { variantImages: { orderBy: { sortOrder: 'asc' } } } },
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
        brand: { select: { id: true, name: true, slug: true } },
        imagesRel: { orderBy: { sortOrder: 'asc' } },
      },
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
        const defaultVariant = await prisma.variant.create({
          data: {
            productId: p.id,
            sku: `default-${p.id.slice(0, 8)}`,
            attributes: { name: p.name },
            price: p.basePrice || 0,
            stock: 9999,
            image: (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : null,
          },
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
          variants: { include: { variantImages: { orderBy: { sortOrder: 'asc' } } } },
          categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      });
      // Replace products array with refreshed data
      products.length = 0;
      refreshedProducts.forEach(p => {
        if (p.images && typeof p.images === 'string') {
          try { p.images = JSON.parse(p.images); } catch(e) { p.images = []; }
        }
        products.push(p);
      });
    }

    // Use first product as default/main product
    const mainProduct = products.length > 0 ? products[0] : null;

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