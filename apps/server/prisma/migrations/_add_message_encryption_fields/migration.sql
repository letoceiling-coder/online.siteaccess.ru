-- AlterTable
ALTER TABLE " messages\ ADD COLUMN IF NOT EXISTS \ciphertext\ TEXT;

-- AlterTable
ALTER TABLE \messages\ ADD COLUMN IF NOT EXISTS \encryptionVersion\ INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE \messages\ ADD COLUMN IF NOT EXISTS \clientMessageId\ TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS \messages_clientMessageId_key\ ON \messages\(\clientMessageId\) WHERE \clientMessageId\ IS NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS \messages_clientMessageId_idx\ ON \messages\(\clientMessageId\);
