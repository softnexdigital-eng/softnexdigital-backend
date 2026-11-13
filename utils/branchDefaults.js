async function ensureTenantDefaultBranch(db, tenantId) {
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, timezone: true },
    });
    if (!tenant) throw new Error("Cannot create a default branch for a missing tenant");

    let branch = await tx.branch.findFirst({
      where: { tenantId, isDefault: true },
      orderBy: { createdAt: "asc" },
    });
    let created = false;
    if (!branch) {
      branch = await tx.branch.findFirst({
        where: { tenantId },
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      });
      if (branch) {
        branch = await tx.branch.update({
          where: { id: branch.id },
          data: { isDefault: true, isActive: true },
        });
      } else {
        branch = await tx.branch.create({
          data: {
            tenantId,
            name: `${tenant.name || "Business"} - Main Branch`,
            code: "MAIN",
            timezone: tenant.timezone,
            openingHours: {},
            isDefault: true,
            isActive: true,
          },
        });
        created = true;
      }
    } else if (!branch.isActive) {
      branch = await tx.branch.update({
        where: { id: branch.id },
        data: { isActive: true },
      });
    }

    const users = await tx.user.findMany({
      where: { tenantId },
      select: { id: true, role: true, isActive: true },
    });
    for (const user of users) {
      await tx.branchMembership.upsert({
        where: { branchId_userId: { branchId: branch.id, userId: user.id } },
        create: {
          tenantId,
          branchId: branch.id,
          userId: user.id,
          role: user.role || "STAFF",
          permissions: {},
          isActive: user.isActive,
        },
        update: {},
      });
    }
    return { branch, created };
  });
}

module.exports = { ensureTenantDefaultBranch };
