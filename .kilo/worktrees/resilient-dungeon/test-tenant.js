const prisma = require('./models');
const tenant = await prisma.tenant.findFirst({
  where: { email: { contains: 'fahiomnuman' } },
  include: { users: true, landingPage: true }
});
console.log(JSON.stringify(tenant, null, 2));
await prisma.$disconnect();
