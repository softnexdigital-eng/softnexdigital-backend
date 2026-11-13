# Database Migration Notes

## Migration inventory

| Migration | Change | Compatibility notes |
|---|---|---|
| `20261110100000_business_foundation` | Adds `BusinessType`, Tenant business profile/settings JSON fields, `Branch`, `BranchMembership`, constraints/indexes, and backfills a default branch and existing-user memberships | Existing tenants default to `RETAIL`; existing feature flags and ecommerce tables are unchanged. |
| `20261110160400_restore_default_sidebar_modules` | Expands the default enabled-module list for tenants still using the P1A starter list | Updates only an exact match; customized module arrays are preserved. No rows are deleted. |
| `20261110170000_branch_inventory_foundation` | Adds branch balances, append-only movement records, adjustment records, negative-stock policy, and order branch references; backfills legacy stock to each tenant's default branch | Additive. Existing `Variant.stock` is retained as a compatibility aggregate, existing order data is retained, and historical `InventoryLog` rows are not rewritten. The connected database reports this migration history as up to date. |

P3A purchasing models are present in `schema.prisma` and the connected database contains the purchase/receipt/payment tables, but there is no checked-in P3A migration. The existing database was previously modified with `prisma db push`; migration status does not compare the full live schema to `schema.prisma`. Do not mark the purchase schema migration-complete or run `migrate deploy` as a substitute for a reviewed additive P3A migration. Before introducing one, compare all columns, indexes, constraints and enum values on the live database, then make the migration safely handle objects already created by `db push`.

The migration uses `IF NOT EXISTS` for added columns/tables/indexes and duplicate-object handling for the enum. The matching operational script is `node scripts/backfill-business-foundation.js`; it can safely be re-run to ensure each tenant has a default branch and existing tenant users have memberships on it.

## Backfills and reconciliation

- Each tenant without branches receives one active default branch (`<tenant name> - Main Branch`, code `MAIN`).
- New tenant registration also ensures this default branch and memberships through `utils/branchDefaults.js`.
- Tenants with branches but no default retain their branches; the oldest branch is designated default.
- Existing tenant users receive an active/inactive membership mirroring their current `User.isActive`, with their current role copied and no added permission grants. Existing business-admin access remains role-based.
- A unique partial index permits at most one default branch per tenant.
- Verify after migration: every tenant has exactly one default branch; every default branch is active; all memberships point to a branch and user belonging to the same tenant; all existing tenant users have membership on that tenant's default branch.

Recommended checks:

```sql
SELECT t."id", COUNT(b."id") AS "defaultCount"
FROM "Tenant" t
LEFT JOIN "Branch" b ON b."tenantId" = t."id" AND b."isDefault" = true
GROUP BY t."id"
HAVING COUNT(b."id") <> 1;

SELECT bm."id"
FROM "BranchMembership" bm
JOIN "Branch" b ON b."id" = bm."branchId"
JOIN "User" u ON u."id" = bm."userId"
WHERE bm."tenantId" <> b."tenantId" OR bm."tenantId" <> u."tenantId";
```

## Verification

The following read-only checks were run during the 2026-11-11 audit:

- `npx prisma migrate status`: six checked-in migrations; database reports no pending migrations.
- `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`: no schema difference detected.
- Read-only `information_schema.tables` query: `Branch`, `BranchInventory`, `InventoryMovement`, `PurchaseOrder`, `PurchaseReceipt`, `PurchaseReceiptItem`, and `SupplierPayment` exist. `InventoryTransfer` does not exist.
- The table-presence check does not validate every column, index, constraint, enum value, or data reconciliation result.

Run the following before a future inventory rollout or after restoring a database:

```powershell
node scripts\reconcile-branch-inventory.js
```

The command is read-only and exits non-zero if any variant's legacy stock differs from the sum of branch balances, if any branch balance differs from its movement ledger, or if an order has no branch. Run it before rollout and again after the application begins writing branch movements. It reports at most 100 records per drift category to keep output bounded.

## Rollback procedures

The branch-inventory migration is additive and is not safe to reverse after movements have been recorded. Do not drop branch inventory, movements, adjustment history, or branch references to roll back. If application code must be reverted, deploy the prior code while retaining the additive schema and `Variant.stock` compatibility aggregate; use a forward corrective migration to repair any drift. Take a database backup and rehearse rollback on a recent staging snapshot before applying this migration to production. Never use `prisma migrate reset` or drop these objects in a shared/production database.
