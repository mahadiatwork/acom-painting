# Fix Vercel Database Connection - Step by Step

## Problem
You're getting `getaddrinfo ENOTFOUND db.pnsmrlzpjdbvwkianvwg.supabase.co` which means Vercel is still using the **direct connection** instead of the **connection pooling URL**.

## Critical Steps to Fix

### Step 1: Get the Correct Connection String from Supabase

1. **Go to Supabase Dashboard**
   - https://supabase.com/dashboard
   - Select your project

2. **Navigate to Database Settings**
   - Click **Settings** (gear icon) in left sidebar
   - Click **Database**

3. **Find "Connection Pooling" Section**
   - Scroll down past "Connection info"
   - Look for **"Connection Pooling"** section
   - Under "Connection string", click the **copy icon**

4. **Verify the URL Format**
   The correct URL should look like:
   ```
   postgresql://postgres.pnsmrlzpjdbvwkianvwg:YOUR_PASSWORD@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   
   **Key indicators it's correct:**
   - ✅ Host: `pooler.supabase.com` (NOT `db.xxx.supabase.co`)
   - ✅ Port: `6543` (NOT `5432`)
   - ✅ Username: `postgres.PROJECT_REF` (NOT just `postgres`)
   - ✅ Has `?pgbouncer=true` at the end

### Step 2: Update Vercel Environment Variable

1. **Go to Vercel Dashboard**
   - https://vercel.com/dashboard
   - Select your project: `acom-painting`

2. **Navigate to Environment Variables**
   - Click **Settings** tab
   - Click **Environment Variables** in left sidebar

3. **Find `DATABASE_URL`**
   - Look for `DATABASE_URL` in the list
   - **IMPORTANT**: Check which environments it's set for:
     - Production
     - Preview
     - Development
   
4. **Update the Value**
   - Click on `DATABASE_URL` to edit
   - **Replace the entire value** with the connection pooling URL from Step 1
   - Make sure to select **all environments** (Production, Preview, Development)
   - Click **Save**

5. **Verify the Value**
   - After saving, click on `DATABASE_URL` again
   - Verify it shows:
     - Host contains `pooler.supabase.com`
     - Port is `6543`
     - Has `?pgbouncer=true`

### Step 3: Redeploy (CRITICAL!)

**After updating the environment variable, you MUST redeploy:**

1. **Option A: Automatic Redeploy (Recommended)**
   - Go to **Deployments** tab
   - Click the **three dots** (⋯) on the latest deployment
   - Click **Redeploy**
   - Wait for deployment to complete

2. **Option B: Trigger via Git Push**
   - Make a small change to any file (or just add a comment)
   - Commit and push to trigger a new deployment

3. **Option C: Manual Redeploy**
   - Go to **Deployments** tab
   - Click **Redeploy** button on the latest deployment

### Step 4: Verify the Fix

1. **Check Vercel Logs**
   - Go to **Deployments** tab
   - Click on the latest deployment
   - Click **Functions** tab
   - Look for logs from `/api/sync/projects/trigger`
   - You should see: `[Sync Trigger] DATABASE_URL (sanitized): postgresql://postgres.****@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

2. **Test the Zoho Script**
   - Run your Zoho workflow again
   - Check the response - it should now succeed

## Common Mistakes

### ❌ Wrong: Direct Connection
```
postgresql://postgres:password@db.pnsmrlzpjdbvwkianvwg.supabase.co:5432/postgres
```
- Host: `db.xxx.supabase.co`
- Port: `5432`
- Username: `postgres` (no project ref)

### ✅ Correct: Connection Pooling
```
postgresql://postgres.pnsmrlzpjdbvwkianvwg:password@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
- Host: `pooler.supabase.com`
- Port: `6543`
- Username: `postgres.PROJECT_REF`
- Has `?pgbouncer=true`

## Still Not Working?

1. **Check Vercel Logs**
   - Look for the `[Sync Trigger] DATABASE_URL` log message
   - If it still shows `db.xxx.supabase.co:5432`, the env var wasn't updated correctly

2. **Verify Environment Variable Scope**
   - Make sure `DATABASE_URL` is set for **Production** environment
   - Preview and Development are optional but recommended

3. **Check for Multiple Variables**
   - Make sure there's only ONE `DATABASE_URL` variable
   - Delete any duplicates

4. **Wait for Deployment**
   - Environment variable changes require a new deployment
   - Wait 1-2 minutes after redeploy before testing

5. **Check Supabase Project**
   - Make sure you're using the correct Supabase project
   - The project ref (`pnsmrlzpjdbvwkianvwg`) should match

## Quick Checklist

- [ ] Got connection pooling URL from Supabase (port 6543)
- [ ] Updated `DATABASE_URL` in Vercel for all environments
- [ ] Verified the URL contains `pooler.supabase.com:6543`
- [ ] Redeployed the application
- [ ] Checked Vercel logs to confirm correct connection string
- [ ] Tested Zoho workflow again
