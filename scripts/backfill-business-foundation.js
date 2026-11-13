const prisma = require("../models");
const { ensureTenantDefaultBranch } = require("../utils/branchDefaults");

async function backfillBusinessFoundation(db) {
  const tenants = await db.tenant.findMany({
    select: { id: true, name: true, timezone: true },
    orderBy: { id: "asc" },
  });
  let branchesCreated = 0;
  let membershipsCreated = 0;

  for (const tenant of tenants) {
    const previousMembershipCount = await db.branchMembership.count({
      where: { tenantId: tenant.id },
    });
    const result = await ensureTenantDefaultBranch(db, tenant.id);
    if (result.created) branchesCreated += 1;
    const currentMembershipCount = await db.branchMembership.count({
      where: { tenantId: tenant.id },
    });
    membershipsCreated += currentMembershipCount - previousMembershipCount;
    console.log(`Business foundation backfilled for tenant ${tenant.id}: default branch ${result.branch.id}`);
  }

  return { tenantsProcessed: tenants.length, branchesCreated, membershipsCreated };
}

if (require.main === module) {
  backfillBusinessFoundation(prisma)
    .then((result) => {
      console.log("Business foundation backfill complete:", result);
    })
    .catch((error) => {
      console.error("Business foundation backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { backfillBusinessFoundation };
