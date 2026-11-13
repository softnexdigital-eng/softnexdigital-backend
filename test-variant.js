async function main() {
  const prisma = require('./models');
  
  // First, get all products for a tenant to find one to use for variant creation
  const tenant = await prisma.tenant.findFirst({
    where: { email: { contains: 'test' } }
  });
  
  if (!tenant) {
    console.log('No tenant found');
    await prisma.$disconnect();
    return;
  }
  
  console.log('Tenant:', tenant.email);
  
  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true }
  });
  
  console.log('\nProducts:');
  console.log(JSON.stringify(products, null, 2));
  
  // Now try to create a variant
  // For demo, let's just show what a variant creation would look like
  console.log('\n\nVariant creation requires:');
  console.log('- productId (required)');
  console.log('- sku (required)');
  console.log('- price (required)');
  
  await prisma.$disconnect();
}
main();
