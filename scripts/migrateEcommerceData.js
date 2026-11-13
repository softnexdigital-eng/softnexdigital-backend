// Script to migrate existing data for e-commerce features
// Run: node scripts/migrateEcommerceData.js
const prisma = require('../models');

async function migrateProductImages() {
  console.log('Migrating product images from JSON to ProductImage records...');
  
  const products = await prisma.product.findMany({
    include: { imagesRel: true }
  });
  
  let migrated = 0;
  for (const product of products) {
    // Skip if already has ProductImage records
    if (product.imagesRel && product.imagesRel.length > 0) {
      continue;
    }
    
    let images = product.images;
    if (typeof images === 'string') {
      try { images = JSON.parse(images); } catch(e) { images = []; }
    }
    
    if (Array.isArray(images) && images.length > 0) {
      const imageRecords = images.map((url, idx) => ({
        productId: product.id,
        url: typeof url === 'string' ? url : (url.url || ''),
        altText: url.altText || null,
        isPrimary: idx === 0,
        sortOrder: idx,
      }));
      
      await prisma.productImage.createMany({ data: imageRecords });
      migrated++;
      console.log(`  Created ${imageRecords.length} ProductImage records for product ${product.name}`);
    }
  }
  
  console.log(`Migration complete: ${migrated} products processed`);
}

async function generateMissingSlugs() {
  console.log('Generating slugs for products without slugs...');
  
  const products = await prisma.product.findMany({
    where: { slug: null }
  });
  
  let generated = 0;
  for (const product of products) {
    const baseSlug = product.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${product.id.substring(0, 8)}`;
    
    await prisma.product.update({
      where: { id: product.id },
      data: { slug }
    });
    generated++;
    console.log(`  Generated slug for product ${product.name}: ${slug}`);
  }
  
  console.log(`Slug generation complete: ${generated} products updated`);
}

async function main() {
  console.log('=== E-commerce Data Migration ===\n');
  
  try {
    await migrateProductImages();
    console.log('');
    await generateMissingSlugs();
    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();