const prisma = require("../models");

const listPublicStores = async (req, res, next) => {
  try {
    const landingPages = await prisma.landingPage.findMany({
      where: {
        published: true,
        tenant: { status: "ACTIVE" },
      },
      select: {
        slug: true,
        title: true,
        logoUrl: true,
        tenant: {
          select: {
            name: true,
            companyName: true,
            logo: true,
          },
        },
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({
      success: true,
      data: landingPages.map(({ slug, title, logoUrl, tenant }) => ({
        slug,
        name: title || tenant.companyName || tenant.name,
        logo: logoUrl || tenant.logo || null,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listPublicStores };
