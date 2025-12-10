# Fix Database Connection - Supabase Connection Pooling

## Problem
You're using the **direct connection** URL which doesn't work well with `@neondatabase/serverless` in serverless environments.

## Solution
Use Supabase's **Connection Pooling** URL instead.

## Steps to Get the Correct Connection String

1. **Go to your Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Navigate to Database Settings**
   - Click **Settings** (gear icon) in the left sidebar
   - Click **Database** in the settings menu

3. **Find Connection Pooling**
   - Scroll down to the **Connection Pooling** section
   - Look for **Connection string** (NOT "Connection string" under "Connection info")

4. **Copy the Pooling URL**
   - It should look like:
     ```
     postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```
   - Notice:
     - Host contains `pooler.supabase.com`
     - Port is `6543` (not `5432`)
     - Has `?pgbouncer=true` parameter

5. **Update Your `.env.local`**
   - Replace your current `DATABASE_URL` with the pooling URL
   - Make sure to URL-encode the password if it contains special characters (the code now handles this automatically)

## Current vs. Correct Format

**❌ Current (Direct Connection - Won't Work):**
```
postgresql://postgres:password@db.oeelxninfrdcacparkra.supabase.co:5432/postgres
```

**✅ Correct (Connection Pooling - Will Work):**
```
postgresql://postgres.oeelxninfrdcacparkra:password@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

## After Updating

1. Restart your dev server (`pnpm run dev`)
2. Check the terminal logs - you should see:
   - `[DB] Connection string (sanitized): postgresql://postgres.****@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - No more "fetch failed" errors

## Why This Matters

- **Direct connection (5432)**: Has firewall restrictions, doesn't work well in serverless
- **Connection pooling (6543)**: Designed for serverless, handles connection pooling automatically, works with `@neondatabase/serverless`

