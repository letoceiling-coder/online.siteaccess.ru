-- AlterTable
ALTER TABLE " channels\ DROP COLUMN IF EXISTS \domain\;
ALTER TABLE \channels\ DROP COLUMN IF EXISTS \apiKey\;
ALTER TABLE \channels\ ADD COLUMN IF NOT EXISTS \tokenHash\ TEXT;
ALTER TABLE \channels\ ADD COLUMN IF NOT EXISTS \allowedDomains\ JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS \channels_tokenHash_key\ ON \channels\(\tokenHash\);

-- AlterTable
ALTER TABLE \visitors\ DROP COLUMN IF EXISTS \name\;
ALTER TABLE \visitors\ DROP COLUMN IF EXISTS \email\;
ALTER TABLE \visitors\ DROP COLUMN IF EXISTS \metadata\;
ALTER TABLE \visitors\ ADD COLUMN IF NOT EXISTS \externalId\ TEXT;
ALTER TABLE \visitors\ ADD COLUMN IF NOT EXISTS \lastSeenAt\ TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS \visitors_externalId_key\ ON \visitors\(\externalId\);
CREATE INDEX IF NOT EXISTS \visitors_channelId_idx\ ON \visitors\(\channelId\);
CREATE INDEX IF NOT EXISTS \visitors_externalId_idx\ ON \visitors\(\externalId\);

-- AlterTable
ALTER TABLE \conversations\ DROP COLUMN IF EXISTS \operatorId\;

-- AlterTable
ALTER TABLE \messages\ DROP COLUMN IF EXISTS \content\;
ALTER TABLE \messages\ DROP COLUMN IF EXISTS \messageType\;
ALTER TABLE \messages\ DROP COLUMN IF EXISTS \readAt\;
ALTER TABLE \messages\ DROP COLUMN IF EXISTS \deliveredAt\;
ALTER TABLE \messages\ ADD COLUMN IF NOT EXISTS \senderId\ TEXT;
ALTER TABLE \messages\ ADD COLUMN IF NOT EXISTS \text\ TEXT;
ALTER TABLE \messages\ ADD COLUMN IF NOT EXISTS \clientMessageId\ TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS \messages_clientMessageId_key\ ON \messages\(\clientMessageId\);
CREATE INDEX IF NOT EXISTS \messages_conversationId_idx\ ON \messages\(\conversationId\);
CREATE INDEX IF NOT EXISTS \messages_createdAt_idx\ ON \messages\(\createdAt\);
CREATE INDEX IF NOT EXISTS \messages_clientMessageId_idx\ ON \messages\(\clientMessageId\);

-- AlterTable
ALTER TABLE \attachments\ DROP COLUMN IF EXISTS \fileUrl\;
ALTER TABLE \attachments\ DROP COLUMN IF EXISTS \fileName\;
ALTER TABLE \attachments\ DROP COLUMN IF EXISTS \fileType\;
ALTER TABLE \attachments\ ADD COLUMN IF NOT EXISTS \url\ TEXT NOT NULL;
ALTER TABLE \attachments\ ADD COLUMN IF NOT EXISTS \type\ TEXT NOT NULL;
ALTER TABLE \attachments\ ADD COLUMN IF NOT EXISTS \fileName\ TEXT;
ALTER TABLE \attachments\ ADD COLUMN IF NOT EXISTS \fileSize\ INTEGER;
ALTER TABLE \attachments\ ADD COLUMN IF NOT EXISTS \mimeType\ TEXT;
