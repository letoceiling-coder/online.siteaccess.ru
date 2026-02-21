# Database Rules and Prisma Migration Policy

## Overview

This document defines strict rules for database schema changes to prevent drift and ensure consistency between code and database.

## Core Principles

### 1. Prisma Schema is Single Source of Truth

- **`prisma/schema.prisma`** is the authoritative definition of the database schema
- All database changes MUST be reflected in `schema.prisma` first
- The database schema MUST match `schema.prisma` exactly (via `@map` directives for column name differences)

### 2. No Manual SQL in Production

- **NEVER** run manual `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, etc. directly on production database
- **NEVER** modify database schema outside of Prisma migrations
- All schema changes MUST go through Prisma migration workflow

### 3. Any DB Change = New Migration

- Every schema change requires a new Prisma migration
- Use `pnpm prisma migrate dev --name <migration_name>` to create migrations locally
- Migrations are applied to production via `pnpm prisma migrate deploy`

### 4. Never Delete Migration Files

- **NEVER** delete files from `prisma/migrations/` directory
- **NEVER** modify existing migration files after they've been applied
- Migration history is immutable - it represents the evolution of the schema

### 5. Never Truncate _prisma_migrations

- **NEVER** manually delete rows from `_prisma_migrations` table
- This table is managed by Prisma and tracks which migrations have been applied
- Tampering with this table will cause Prisma to lose track of migration state

## Workflow

### Making Schema Changes

1. **Edit `prisma/schema.prisma`** - Make your changes to the schema
2. **Create migration**: `pnpm prisma migrate dev --name descriptive_name`
3. **Review migration SQL** - Check `prisma/migrations/<timestamp>_descriptive_name/migration.sql`
4. **Test locally** - Ensure migration applies cleanly
5. **Commit with `[DB_CHANGE]` flag** - Required for CI to pass
6. **Deploy**: `pnpm prisma migrate deploy` on production

### Commit Message Format

When changing `prisma/schema.prisma` or `prisma/migrations/`, commit message MUST include:

```
[DB_CHANGE] Description of change
```

Example:
```
[DB_CHANGE] Add encryptionVersion field to Message model
```

## CI Protection

The CI pipeline will **FAIL** if:
- `prisma/schema.prisma` is modified without `[DB_CHANGE]` in commit message
- `prisma/migrations/**` files are modified without `[DB_CHANGE]` in commit message

This prevents accidental schema changes that could cause production issues.

## Emergency Procedures

### If Schema Drift is Detected

1. **DO NOT** manually fix the database
2. **DO NOT** delete migrations
3. Create a new migration that aligns the database with the schema
4. Use `prisma migrate resolve` if needed to mark migrations as applied

### If Migration Fails in Production

1. **DO NOT** manually run SQL to "fix" it
2. Review the migration SQL for issues
3. Create a new migration to correct the problem
4. Use `prisma migrate resolve --rolled-back <migration_name>` if needed

## Best Practices

- Always test migrations on a staging environment first
- Keep migrations small and focused (one logical change per migration)
- Use descriptive migration names
- Review generated SQL before committing
- Ensure `prisma generate` is run after schema changes
- Never commit broken migrations

## Enforcement

- CI will block commits that modify Prisma files without `[DB_CHANGE]` flag
- Code reviews must verify migration SQL is correct
- Production deployments must use `prisma migrate deploy` (not `migrate dev`)
