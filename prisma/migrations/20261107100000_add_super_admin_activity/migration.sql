CREATE TABLE "PageVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVisit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperAdminNotification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityId" TEXT,
    "tenantId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageVisit_createdAt_idx" ON "PageVisit"("createdAt");
CREATE INDEX "PageVisit_tenantId_createdAt_idx" ON "PageVisit"("tenantId", "createdAt");
CREATE INDEX "PageVisit_slug_createdAt_idx" ON "PageVisit"("slug", "createdAt");
CREATE INDEX "SuperAdminNotification_read_createdAt_idx" ON "SuperAdminNotification"("read", "createdAt");
CREATE INDEX "SuperAdminNotification_tenantId_idx" ON "SuperAdminNotification"("tenantId");

ALTER TABLE "PageVisit"
ADD CONSTRAINT "PageVisit_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PageVisit"
ADD CONSTRAINT "PageVisit_landingPageId_fkey"
FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SuperAdminNotification"
ADD CONSTRAINT "SuperAdminNotification_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
