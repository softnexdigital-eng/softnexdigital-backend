const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const variantId = "0490b6c1-d01d-4ef3-9ab6-b3dda152098e"; // First variant with Color attr

  const redUrl = "https://img.drz.lazcdn.com/collect/sg/p/97ce7e4b0a1cfdf8a65bee0fd538767a.png_200x200q80.avif";
  const blueUrl = "https://img.drz.lazcdn.com/collect/sg/p/cab793ce3f2f30af7478e869ee5a78e1.jpg_200x200q80.avif";

  // Delete old test images if any
  await prisma.variantImage.deleteMany({ where: { variantId } });

  // Create new ones with color field
  await prisma.variantImage.createMany({
    data: [
      {
        variantId,
        url: redUrl,
        altText: "red",
        color: "red",
        isPrimary: false,
        sortOrder: 0,
      },
      {
        variantId,
        url: blueUrl,
        altText: "BLUE",
        color: "BLUE",
        isPrimary: false,
        sortOrder: 1,
      },
    ],
  });

  // Verify
  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { variantImages: { orderBy: { sortOrder: 'asc' } } },
  });
  console.log(`\nVariant: ${variant.sku}`);
  console.log(`Color attr: ${JSON.stringify(variant.attributes.COLOR)}`);
  console.log(`\nImages: ${variant.variantImages.length}`);
  variant.variantImages.forEach(img => {
    console.log(`  - color: ${img.color}, altText: ${img.altText}, url: ${img.url}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });