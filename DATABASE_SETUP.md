# Database Setup - Connection Strings

## Two Connection Strings Needed

Supabase provides **two different connection strings** for different purposes:

### 1. **Connection Pooling** (Runtime - `DATABASE_URL`)
- **Use for:** Your application runtime (API routes, serverless functions)
- **Port:** `6543`
- **Host:** `aws-1-us-west-1.pooler.supabase.com` (or similar)
- **Parameter:** `?pgbouncer=true`
- **Why:** Better for serverless, handles connection pooling automatically

### 2. **Direct Connection** (Migrations - `DATABASE_URL_DIRECT`)
- **Use for:** Database migrations (`drizzle-kit push`)
- **Port:** `5432`
- **Host:** `db.oeelxninfrdcacparkra.supabase.co` (or similar)
- **Why:** Drizzle Kit needs full Postgres features for migrations

## Setup Steps

1. **Get Both Connection Strings from Supabase:**
   - Go to **Settings** → **Database**
   - **Connection Pooling** section → Copy the pooling URL (port 6543)
   - **Connection info** section → Copy the direct connection URL (port 5432)

2. **Add to `.env.local`:**
   ```env
   # Runtime connection (pooler) - for your app
   DATABASE_URL=postgresql://postgres.PROJECT_REF:password@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   
   # Direct connection (for migrations)
   DATABASE_URL_DIRECT=postgresql://postgres:password@db.PROJECT_REF.supabase.co:5432/postgres
   ```

3. **Run Migrations:**
   ```bash
   pnpm run db:push
   ```

## Why Two Connections?

- **Pooler (6543):** Optimized for serverless, limits connections, works with `postgres-js`
- **Direct (5432):** Full Postgres features, needed for migrations and schema changes

## Current Status

✅ **Connection Working:** Your app can now connect to Supabase!
❌ **Tables Missing:** Run `pnpm run db:push` after setting `DATABASE_URL_DIRECT`


test

