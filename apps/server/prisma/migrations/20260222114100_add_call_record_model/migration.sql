-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdByRole" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calls_channelId_idx" ON "calls"("channelId");

-- CreateIndex
CREATE INDEX "calls_conversationId_idx" ON "calls"("conversationId");

-- CreateIndex
CREATE INDEX "calls_status_idx" ON "calls"("status");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
