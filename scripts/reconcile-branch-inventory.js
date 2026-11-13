require("dotenv").config();
const prisma = require("../models");

const serialize = (_key, value) => (typeof value === "bigint" ? value.toString() : value);

async function main() {
  const [stockDrift, ledgerDrift, unassignedOrders, totals] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT v."id" AS "variantId", p."tenantId", v."stock" AS "legacyStock",
             COALESCE(SUM(bi."quantity"), 0) AS "branchStock"
      FROM "Variant" v
      JOIN "Product" p ON p."id" = v."productId"
      LEFT JOIN "BranchInventory" bi ON bi."variantId" = v."id" AND bi."tenantId" = p."tenantId"
      GROUP BY v."id", p."tenantId", v."stock"
      HAVING ABS(v."stock" - COALESCE(SUM(bi."quantity"), 0)) > 0.000001
      ORDER BY p."tenantId", v."id"
      LIMIT 100
    `),
    prisma.$queryRawUnsafe(`
      SELECT bi."id", bi."tenantId", bi."branchId", bi."variantId",
             bi."quantity" AS "balance",
             COALESCE(SUM(im."quantity"), 0) AS "ledgerBalance"
      FROM "BranchInventory" bi
      LEFT JOIN "InventoryMovement" im
        ON im."tenantId" = bi."tenantId"
       AND im."branchId" = bi."branchId"
       AND im."variantId" = bi."variantId"
      GROUP BY bi."id", bi."tenantId", bi."branchId", bi."variantId", bi."quantity"
      HAVING ABS(bi."quantity" - COALESCE(SUM(im."quantity"), 0)) > 0.000001
      ORDER BY bi."tenantId", bi."branchId", bi."variantId"
      LIMIT 100
    `),
    prisma.order.count({ where: { branchId: null } }),
    prisma.$queryRawUnsafe(`
      SELECT (SELECT COUNT(*) FROM "Variant") AS "variants",
             (SELECT COALESCE(SUM("stock"), 0) FROM "Variant") AS "legacyStock",
             (SELECT COALESCE(SUM("quantity"), 0) FROM "BranchInventory") AS "branchStock",
             (SELECT COUNT(*) FROM "InventoryMovement" WHERE "type" = 'OPENING_STOCK') AS "openingMovements"
    `),
  ]);

  const report = { totals, stockDrift, ledgerDrift, unassignedOrders };
  console.log(JSON.stringify(report, serialize, 2));
  if (stockDrift.length || ledgerDrift.length || unassignedOrders) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Branch inventory reconciliation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
