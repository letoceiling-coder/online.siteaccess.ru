# Development Workflow

This document describes the development, testing, and deployment workflow for the online.siteaccess.ru project.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL (running and accessible)
- Redis (running and accessible)

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd online.siteaccess.ru
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cd apps/server
   cp .env.example .env
   # Edit .env with your local database and Redis credentials
   ```

4. Run Prisma migrations:
   ```bash
   pnpm prisma migrate deploy
   pnpm prisma generate
   ```

5. Start the development server:
   ```bash
   pnpm dev
   ```

The server will start on `http://localhost:3100` (or the port specified in `.env`).

### Building

Build all packages:
```bash
pnpm -r build
```

Build a specific package:
```bash
pnpm -C apps/server build
pnpm -C apps/widget build
pnpm -C apps/operator-web build
pnpm -C apps/portal build
```

## Production Deployment

### Server Setup

1. Ensure systemd service is configured:
   ```bash
   sudo systemctl status online-siteaccess
   ```

2. Environment variables are loaded from:
   ```
   /var/www/online.siteaccess.ru/apps/server/.env
   ```

3. Restart the service:
   ```bash
   sudo systemctl restart online-siteaccess
   ```

4. Check logs:
   ```bash
   sudo journalctl -u online-siteaccess -n 100 --no-pager
   ```

### Deployment Steps

1. Pull latest code:
   ```bash
   cd /var/www/online.siteaccess.ru
   git pull origin main
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run Prisma migrations:
   ```bash
   cd apps/server
   pnpm prisma migrate deploy
   pnpm prisma generate
   ```

4. Build all packages:
   ```bash
   cd /var/www/online.siteaccess.ru
   pnpm -r build
   ```

5. Restart service:
   ```bash
   sudo systemctl restart online-siteaccess
   ```

6. Verify health:
   ```bash
   curl https://online.siteaccess.ru/health
   ```

## Smoke Testing

Smoke tests verify that critical endpoints are working correctly. They should never print secrets and should exit with code 1 only on server errors (>= 500).

### Available Smoke Tests

- **Health check**: `pnpm -C apps/server run smoke:health`
  - Tests `GET /health`
  - Verifies server is responding and DB/Redis are connected

- **Operator login**: `pnpm -C apps/server run smoke:operator`
  - Tests operator authentication flow
  - Verifies endpoint returns 401 (not 500) for invalid credentials

### Running Smoke Tests

Local (against production):
```bash
cd apps/server
pnpm run smoke:health
pnpm run smoke:operator
```

With custom API URL:
```bash
API_URL=http://localhost:3100 pnpm -C apps/server run smoke:health
```

### Adding New Smoke Tests

1. Create script in `apps/server/scripts/smoke-*.mjs`
2. Follow these rules:
   - Never print secrets (tokens, passwords)
   - Exit 1 only on status >= 500
   - Exit 0 on 200/401/400 (expected states)
3. Add npm script in `apps/server/package.json`:
   ```json
   "smoke:testname": "node scripts/smoke-testname.mjs"
   ```
4. Add to CI workflow (`.github/workflows/ci.yml`)

## Debugging Operator Login

If operator login fails:

1. Check logs:
   ```bash
   sudo journalctl -u online-siteaccess -n 200 --no-pager | grep -E 'operator|Operator|login|Login'
   ```

2. Verify user exists:
   ```bash
   # Check database directly (if needed)
   psql -U online_sa -d online_siteaccess -c "SELECT id, email FROM users WHERE email = 'user@example.com';"
   ```

3. Verify channel exists:
   ```bash
   psql -U online_sa -d online_siteaccess -c "SELECT id, name, owneruserid FROM channels WHERE id = 'channel-uuid';"
   ```

4. Verify ChannelMember exists:
   ```bash
   psql -U online_sa -d online_siteaccess -c "SELECT * FROM channel_members WHERE channelid = 'channel-uuid' AND userid = 'user-uuid';"
   ```

5. Run smoke test:
   ```bash
   pnpm -C apps/server run smoke:operator
   ```

Common issues:
- **500 error**: Check logs for Prisma errors or missing ChannelMember
- **401 error**: Verify email/password and ChannelMember exists
- **Email case sensitivity**: Email is normalized to lowercase in code

## Migration Rules

### Prisma Migrations

**CRITICAL**: Never edit database schema manually in production. Always use Prisma migrations.

1. Create migration:
   ```bash
   cd apps/server
   pnpm prisma migrate dev --name migration_name
   ```

2. Review generated SQL in `prisma/migrations/*/migration.sql`

3. Apply to production:
   ```bash
   pnpm prisma migrate deploy
   ```

4. Regenerate Prisma Client:
   ```bash
   pnpm prisma generate
   ```

### Emergency SQL

If emergency SQL is required:

1. Document the SQL change
2. Apply it manually (if absolutely necessary)
3. Immediately create a baseline migration:
   ```bash
   pnpm prisma migrate resolve --applied migration_name
   ```
4. Or create a new migration that matches the current state:
   ```bash
   pnpm prisma migrate dev --name sync_manual_changes
   ```

### Migration Status

Check migration status:
```bash
cd apps/server
pnpm prisma migrate status
```

All migrations should show as "Applied" in production.

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`:

1. Installs dependencies
2. Builds all packages
3. Validates Prisma schema
4. Runs smoke tests

The workflow fails if any step fails, preventing broken code from being merged.

## Environment Variables

Required environment variables are documented in:
- `apps/server/.env.example`
- `apps/widget/.env.example`

**Never commit `.env` files with real values.** Always use `.env.example` as a template.
