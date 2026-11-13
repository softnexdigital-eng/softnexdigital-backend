CREATE TABLE "MetaPixelConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pixelId" TEXT,
    "accessTokenEncrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPixelConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetaTrackingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MetaTrackingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaPixelConfig_tenantId_key" ON "MetaPixelConfig"("tenantId");
CREATE UNIQUE INDEX "MetaTrackingEvent_tenantId_eventId_key" ON "MetaTrackingEvent"("tenantId", "eventId");
CREATE INDEX "MetaTrackingEvent_tenantId_createdAt_idx" ON "MetaTrackingEvent"("tenantId", "createdAt");
CREATE INDEX "MetaTrackingEvent_status_updatedAt_idx" ON "MetaTrackingEvent"("status", "updatedAt");

ALTER TABLE "MetaPixelConfig"
ADD CONSTRAINT "MetaPixelConfig_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetaTrackingEvent"
ADD CONSTRAINT "MetaTrackingEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
