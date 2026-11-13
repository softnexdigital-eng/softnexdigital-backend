DO $$
BEGIN
  CREATE TYPE "InventoryMovementType" AS ENUM (
    'OPENING_STOCK',
    'SALE',
    'RETURN',
    'PURCHASE',
    'ADJUSTMENT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'DAMAGE',
    'EXPIRED',
    'LOST',
    'STOCK_COUNT',
    'WASTE',
    'REVERSAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "branchId" TEXT;

CREATE TABLE IF NOT EXISTS "BranchInventory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "previousStock" DOUBLE PRECISION NOT NULL,
  "newStock" DOUBLE PRECISION NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "orderId" TEXT,
  "actorId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "movementId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "reason" TEXT NOT NULL,
  "previousStock" DOUBLE PRECISION NOT NULL,
  "countedStock" DOUBLE PRECISION NOT NULL,
  "delta" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchInventory_branchId_variantId_key"
  ON "BranchInventory"("branchId", "variantId");
CREATE INDEX IF NOT EXISTS "BranchInventory_tenantId_branchId_quantity_idx"
  ON "BranchInventory"("tenantId", "branchId", "quantity");
CREATE INDEX IF NOT EXISTS "BranchInventory_tenantId_variantId_idx"
  ON "BranchInventory"("tenantId", "variantId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryMovement_tenantId_idempotencyKey_key"
  ON "InventoryMovement"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "InventoryMovement_tenantId_branchId_variantId_createdAt_idx"
  ON "InventoryMovement"("tenantId", "branchId", "variantId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_orderId_idx"
  ON "InventoryMovement"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAdjustment_movementId_key"
  ON "InventoryAdjustment"("movementId");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_tenantId_branchId_createdAt_idx"
  ON "InventoryAdjustment"("tenantId", "branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_tenantId_variantId_idx"
  ON "InventoryAdjustment"("tenantId", "variantId");
CREATE INDEX IF NOT EXISTS "Order_tenantId_branchId_idx"
  ON "Order"("tenantId", "branchId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchInventory_tenantId_fkey') THEN
    ALTER TABLE "BranchInventory" ADD CONSTRAINT "BranchInventory_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchInventory_branchId_fkey') THEN
    ALTER TABLE "BranchInventory" ADD CONSTRAINT "BranchInventory_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchInventory_variantId_fkey') THEN
    ALTER TABLE "BranchInventory" ADD CONSTRAINT "BranchInventory_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_tenantId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_branchId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_variantId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryMovement_orderId_fkey') THEN
    ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryAdjustment_tenantId_fkey') THEN
    ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryAdjustment_branchId_fkey') THEN
    ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InventoryAdjustment_variantId_fkey') THEN
    ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "Order" AS existing_order
SET "branchId" = default_branch."id"
FROM "Branch" AS default_branch
WHERE existing_order."branchId" IS NULL
  AND default_branch."tenantId" = existing_order."tenantId"
  AND default_branch."isDefault" = true;

INSERT INTO "BranchInventory" (
  "id", "tenantId", "branchId", "variantId", "quantity",
  "minStock", "reorderLevel", "createdAt", "updatedAt"
)
SELECT
  md5(default_branch."id" || ':' || variant."id"),
  product."tenantId",
  default_branch."id",
  variant."id",
  variant."stock",
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Variant" AS variant
JOIN "Product" AS product ON product."id" = variant."productId"
JOIN "Branch" AS default_branch
  ON default_branch."tenantId" = product."tenantId"
 AND default_branch."isDefault" = true
ON CONFLICT ("branchId", "variantId") DO NOTHING;

INSERT INTO "InventoryMovement" (
  "id", "tenantId", "branchId", "variantId", "type", "quantity",
  "previousStock", "newStock", "referenceType", "referenceId",
  "idempotencyKey", "note", "metadata", "createdAt"
)
SELECT
  md5('opening:' || balance."branchId" || ':' || balance."variantId"),
  balance."tenantId",
  balance."branchId",
  balance."variantId",
  'OPENING_STOCK'::"InventoryMovementType",
  balance."quantity",
  0,
  balance."quantity",
  'MIGRATION',
  'branch-inventory-foundation',
  'opening:' || balance."branchId" || ':' || balance."variantId",
  'Legacy Variant.stock backfill',
  '{}'::jsonb,
  CURRENT_TIMESTAMP
FROM "BranchInventory" AS balance
JOIN "Branch" AS branch
  ON branch."id" = balance."branchId"
 AND branch."isDefault" = true
ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_branchId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
