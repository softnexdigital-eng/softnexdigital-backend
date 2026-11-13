DO $$
BEGIN
  CREATE TYPE "BusinessType" AS ENUM (
    'SUPERMARKET',
    'GROCERY',
    'RETAIL',
    'RESTAURANT',
    'CAFE',
    'CLOUD_KITCHEN',
    'TAILORING',
    'BOUTIQUE',
    'GARMENT_WORKSHOP',
    'UNIFORM_MANUFACTURER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "businessType" "BusinessType" NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN IF NOT EXISTS "enabledModules" JSONB NOT NULL DEFAULT '["catalog","orders","customers","inventory"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "businessConfig" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "Branch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "timezone" TEXT,
  "openingHours" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "managerId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BranchMembership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "permissions" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Branch_tenantId_code_key"
  ON "Branch"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_one_default_per_tenant_key"
  ON "Branch"("tenantId") WHERE "isDefault" = true;
CREATE INDEX IF NOT EXISTS "Branch_tenantId_isActive_idx"
  ON "Branch"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "Branch_tenantId_isDefault_idx"
  ON "Branch"("tenantId", "isDefault");
CREATE INDEX IF NOT EXISTS "Branch_managerId_idx"
  ON "Branch"("managerId");
CREATE UNIQUE INDEX IF NOT EXISTS "BranchMembership_branchId_userId_key"
  ON "BranchMembership"("branchId", "userId");
CREATE INDEX IF NOT EXISTS "BranchMembership_tenantId_userId_isActive_idx"
  ON "BranchMembership"("tenantId", "userId", "isActive");
CREATE INDEX IF NOT EXISTS "BranchMembership_tenantId_branchId_isActive_idx"
  ON "BranchMembership"("tenantId", "branchId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Branch_tenantId_fkey') THEN
    ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Branch_managerId_fkey') THEN
    ALTER TABLE "Branch" ADD CONSTRAINT "Branch_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchMembership_tenantId_fkey') THEN
    ALTER TABLE "BranchMembership" ADD CONSTRAINT "BranchMembership_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchMembership_branchId_fkey') THEN
    ALTER TABLE "BranchMembership" ADD CONSTRAINT "BranchMembership_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BranchMembership_userId_fkey') THEN
    ALTER TABLE "BranchMembership" ADD CONSTRAINT "BranchMembership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Branch" (
  "id", "tenantId", "name", "code", "timezone", "openingHours",
  "isDefault", "isActive", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  tenant."id",
  COALESCE(NULLIF(tenant."name", ''), 'Business') || ' - Main Branch',
  'MAIN',
  tenant."timezone",
  '{}'::jsonb,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" tenant
WHERE NOT EXISTS (
  SELECT 1 FROM "Branch" branch WHERE branch."tenantId" = tenant."id"
)
ON CONFLICT ("tenantId", "code") DO NOTHING;

UPDATE "Branch" branch
SET "isDefault" = true, "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE branch."id" = (
  SELECT candidate."id"
  FROM "Branch" candidate
  WHERE candidate."tenantId" = branch."tenantId"
    AND NOT EXISTS (
      SELECT 1 FROM "Branch" current_default
      WHERE current_default."tenantId" = candidate."tenantId"
        AND current_default."isDefault" = true
    )
  ORDER BY candidate."isActive" DESC, candidate."createdAt", candidate."id"
  LIMIT 1
);

UPDATE "Branch"
SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "isDefault" = true AND "isActive" = false;

INSERT INTO "BranchMembership" (
  "id", "tenantId", "branchId", "userId", "role", "permissions",
  "isActive", "createdAt", "updatedAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  branch."tenantId",
  branch."id",
  app_user."id",
  app_user."role",
  '{}'::jsonb,
  app_user."isActive",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Branch" branch
JOIN "User" app_user ON app_user."tenantId" = branch."tenantId"
WHERE branch."isDefault" = true
ON CONFLICT ("branchId", "userId") DO NOTHING;
