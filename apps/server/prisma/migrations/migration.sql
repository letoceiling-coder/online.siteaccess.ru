-- CreateEnum
CREATE TYPE " EncryptionMode\ AS ENUM ('none', 'server', 'e2ee');

-- AlterTable
ALTER TABLE \channels\ ADD COLUMN \encryptionMode\ \EncryptionMode\ NOT NULL DEFAULT 'server';

-- AlterTable
ALTER TABLE \messages\ ADD COLUMN \ciphertext\ TEXT,
ADD COLUMN \encryptionVersion\ INTEGER NOT NULL DEFAULT 0;
