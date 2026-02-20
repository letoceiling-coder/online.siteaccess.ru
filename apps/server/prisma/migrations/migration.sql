-- CreateTable
CREATE TABLE " users\ (
 \id\ TEXT NOT NULL,
 \email\ TEXT NOT NULL,
 \passwordHash\ TEXT NOT NULL,
 \createdAt\ TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 \updatedAt\ TIMESTAMP(3) NOT NULL,

 CONSTRAINT \users_pkey\ PRIMARY KEY (\id\)
);

-- CreateIndex
CREATE UNIQUE INDEX \users_email_key\ ON \users\(\email\);

-- AlterTable
ALTER TABLE \channels\ ADD COLUMN \ownerUserId\ TEXT;

-- CreateIndex
CREATE INDEX \channels_ownerUserId_idx\ ON \channels\(\ownerUserId\);

-- AddForeignKey
ALTER TABLE \channels\ ADD CONSTRAINT \channels_ownerUserId_fkey\ FOREIGN KEY (\ownerUserId\) REFERENCES \users\(\id\) ON DELETE SET NULL ON UPDATE CASCADE;
