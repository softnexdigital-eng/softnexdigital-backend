const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const imageUrl = "https://twelvebd.com/cdn/shop/files/SB-2Pcs-TW26-03EF-109273_3.jpg?v=1770320454&width=533";
  
  // Use the first variant
  const targetVariantId = "0cf4641e-4fb3-4782-8cc3-e36ea8909371";
  
  // Check existing images
  const existingImages = await prisma.variantImage.findMany({
    where: { variantId: targetVariantId }
  });
  
  console.log("Existing images:", existingImages.length);
  
  const existingred = existingImages.find(img => img.altText === "red");
  
  if (!existingred) {
    await prisma.variantImage.create({
      data: {
        variantId: targetVariantId,
        url: imageUrl,
        altText: "red",
        isPrimary: false,
        sortOrder: 0
      }
    });
    console.log("✅ Image added for red!");
  } else {
    await prisma.variantImage.update({
      where: { id: existingred.id },
      data: { url: imageUrl, altText: "red" }
    });
    console.log("✅ Image updated for red!");
  }

  // Verify
  const updated = await prisma.variant.findUnique({
    where: { id: targetVariantId },
    include: { variantImages: true }
  });
  console.log("\nVariant images:", updated?.variantImages?.length || 0);
  for (const img of updated?.variantImages || []) {
    console.log(`  - ${img.altText || 'no alt'}: ${img.url}`);
  }

  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});