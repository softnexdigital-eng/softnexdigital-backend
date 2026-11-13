const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clear existing data in correct order (respect foreign keys)
  await prisma.returnRequest.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.landingPage.deleteMany();
  await prisma.template.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.inventoryLog.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  // ── Super Admin ──────────────────────────────────
  const hashedPassword = await bcrypt.hash("Admin@123", 10);
  await prisma.user.create({
    data: {
      email: "fahiomnuman87@gmail.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      tenantId: null,
    },
  });
  console.log("✓ Super Admin created");

  // ── Test Tenant ──────────────────────────────────
  const testTenant = await prisma.tenant.create({
    data: {
      name: "Test Company",
      email: "test@company.com",
      phone: "+1234567890",
      package: "FREE",
      status: "ACTIVE",
      featureFlags: {},
      onboardingCompleted: false,
      address: "Dhaka, Bangladesh",
      timezone: "Asia/Dhaka",
      preferences: { email_on_order: true },
      orderCounter: 0,
    },
  });

  // ── Business Admin User ─────────────────────────
  const testUserPassword = await bcrypt.hash("TestUser@123", 10);
  await prisma.user.create({
    data: {
      email: "test@example.com",
      password: testUserPassword,
      name: "Test Admin",
      role: "BUSINESS_ADMIN",
      tenantId: testTenant.id,
    },
  });
  console.log("✓ Business Admin created");

  // ── Templates ───────────────────────────────────
  const templateModern = await prisma.template.create({
    data: {
      name: "Modern",
      sections: [
        { type: "hero", title: "Welcome", subtitle: "Best products", image: "", order: 0 },
        { type: "gallery", images: [], order: 1 },
        { type: "description", content: "Product description", order: 2 },
        { type: "orderForm", title: "Place your order", order: 3 },
      ],
      styles: { primaryColor: "#3B82F6", fontFamily: "Inter" },
      isActive: true,
    },
  });

  await prisma.template.create({
    data: {
      name: "Classic",
      sections: [
        { type: "hero", title: "Classic Store", subtitle: "Quality products", image: "", order: 0 },
        { type: "description", content: "Quality description", order: 1 },
        { type: "orderForm", title: "Order Now", order: 2 },
      ],
      styles: { primaryColor: "#8B5CF6", fontFamily: "Georgia" },
      isActive: true,
    },
  });
  console.log("✓ Templates created");
  

  // ── Landing Page (auto-published) ────────────────
  const slug = "test-company";
  await prisma.landingPage.create({
    data: {
      tenantId: testTenant.id,
      templateId: templateModern.id,
      title: "Test Company",
      slug,
      sections: templateModern.sections,
      styles: templateModern.styles,
      seo: { title: "Test Company", description: "" },
      published: true,
      publishedAt: new Date(),
    },
  });
  console.log("✓ Landing page created & published");

  console.log("✓ Database seeded successfully!");
  console.log("");
  console.log("── Login Credentials ──");
  console.log("Super Admin:    fahiomnuman87@gmail.com / Admin@123");
  console.log("Business Admin: test@example.com / TestUser@123");
  console.log("─────────────────────");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });