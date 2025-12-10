# Postgres Connection Troubleshooting - Supabase

## Issue Summary

**Problem:** Unable to establish Postgres connection to Supabase database for both runtime queries and Drizzle migrations.

**Current Status:** 
- ✅ Runtime connection works with Transaction Pooler (port 6543)
- ❌ Drizzle migrations fail with `ENOTFOUND` DNS resolution error
- ❌ Direct connection (port 5432) not accessible due to IPv4 compatibility issue

---

## Error Messages

### Runtime Connection (Initially)
```
Error: Database connection string provided to `neon()` is not a valid URL. 
Connection string: postgresql://postgres.oeelxninfrdcacparkra:RaDdrums123?@aws-1-us-west-1.pooler.supabase.com:5432/postgres
```
**Root Cause:** Password contained `?` character which broke URL parsing (fixed by URL encoding)

### Runtime Connection (After Fix)
```
[DB] Connection string (sanitized): postgresql://postgres.oeelxninfrdcacparkra:****@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
[DB] Postgres client initialized successfully
[API] Postgres query failed (returning Redis entries only): {
  "message": "relation \"time_entries\" does not exist",
  "code": "42P01"
}
```
**Status:** Connection works, but tables don't exist (migration needed)

### Drizzle Migration Error
```
Error: getaddrinfo ENOTFOUND db.oeelxninfrdcacparkra.supabase.co
    at C:\Users\Administrator\Documents\GitHub\roofworx-time-entry-app\node_modules\pg-pool\index.js:45:11
errno: -3008,
code: 'ENOTFOUND',
syscall: 'getaddrinfo',
hostname: 'db.oeelxninfrdcacparkra.supabase.co'
```
**Root Cause:** DNS resolution failure - Direct connection hostname not accessible (IPv4 compatibility issue)

---

## Methods Attempted

### 1. **Fixed Password URL Encoding**
- **Problem:** Password `RaDdrums123?` contained `?` character breaking URL parsing
- **Solution:** Added `encodeConnectionString()` function to URL-encode password
- **Result:** ✅ Fixed URL parsing error
- **Files Modified:** `src/lib/db.ts`

### 2. **Switched from `@neondatabase/serverless` to `postgres-js`**
- **Problem:** `@neondatabase/serverless` had compatibility issues with Supabase pooler
- **Solution:** 
  - Installed `postgres` package
  - Changed from `drizzle-orm/neon-http` to `drizzle-orm/postgres-js`
  - Updated connection client initialization
- **Result:** ✅ Runtime connection now works
- **Files Modified:** `src/lib/db.ts`, `package.json`

### 3. **Connection String Format Fixes**
- **Problem:** Using direct connection (port 5432) instead of pooler (port 6543)
- **Solution:** 
  - Updated to use Transaction Pooler connection string
  - Format: `postgresql://postgres.PROJECT_REF:password@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
- **Result:** ✅ Runtime queries work
- **Files Modified:** `.env.local`

### 4. **Separate Connection String for Migrations**
- **Problem:** Drizzle Kit needs direct connection for migrations, but pooler works for runtime
- **Solution:** 
  - Created `DATABASE_URL_DIRECT` environment variable
  - Updated `drizzle.config.ts` to use `DATABASE_URL_DIRECT` for migrations
  - Runtime code uses `DATABASE_URL` (pooler)
- **Result:** ❌ Direct connection not accessible (IPv4 issue)
- **Files Modified:** `drizzle.config.ts`, `.env.local`

### 5. **Tried Session Pooler for Migrations**
- **Problem:** Direct connection shows "Not IPv4 compatible" warning in Supabase dashboard
- **Solution:** Attempted to use Session Pooler connection string for migrations
- **Result:** ❌ Still getting `ENOTFOUND` error
- **Files Modified:** `.env.local` (updated `DATABASE_URL_DIRECT`)

---

## Current Configuration

### Environment Variables (`.env.local`)
```env
# Runtime connection (Transaction Pooler - works)
DATABASE_URL=postgresql://postgres.oeelxninfrdcacparkra:RaDdrums123%3F@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Migration connection (attempted - not working)
DATABASE_URL_DIRECT=postgresql://postgres:RaDdrums12345hanshan@db.oeelxninfrdcacparkra.supabase.co:5432/postgres
```

### Database Client (`src/lib/db.ts`)
- **Package:** `postgres` (postgres-js)
- **Adapter:** `drizzle-orm/postgres-js`
- **Connection:** Uses `DATABASE_URL` (Transaction Pooler)
- **Status:** ✅ Working for runtime queries

### Drizzle Config (`drizzle.config.ts`)
```typescript
dbCredentials: {
  url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
}
```
- **Status:** ❌ Fails with `ENOTFOUND` when using `DATABASE_URL_DIRECT`

---

## Technical Details

### Connection Types Attempted

1. **Transaction Pooler (Port 6543)**
   - Host: `aws-1-us-west-1.pooler.supabase.com`
   - Status: ✅ Works for runtime
   - Use case: Serverless functions, API routes

2. **Direct Connection (Port 5432)**
   - Host: `db.oeelxninfrdcacparkra.supabase.co`
   - Status: ❌ DNS resolution fails (`ENOTFOUND`)
   - Issue: "Not IPv4 compatible" warning in Supabase dashboard

3. **Session Pooler (Port 5432)**
   - Host: `aws-1-us-west-1.pooler.supabase.com` (with `?pgbouncer=true`)
   - Status: ❌ Still fails with `ENOTFOUND`
   - Attempted as IPv4-compatible alternative

### Network Environment
- **OS:** Windows 10 (win32 10.0.26200)
- **Shell:** PowerShell
- **Network:** Appears to be IPv4-only (based on Supabase warning)
- **DNS Resolution:** Fails for direct connection hostname

### Packages Used
- `postgres@3.4.7` - Postgres client
- `drizzle-orm@0.39.3` - ORM
- `drizzle-kit@0.31.6` - Migration tool

---

## What Works

✅ **Runtime Database Queries**
- Connection to Transaction Pooler (port 6543) works
- Can read/write data (once tables exist)
- URL encoding handles special characters in password

✅ **Application Code**
- Database client initialization successful
- Error handling gracefully falls back to Redis when Postgres unavailable

---

## What Doesn't Work

❌ **Drizzle Migrations**
- Cannot connect to database for schema migrations
- `ENOTFOUND` error suggests DNS/hostname resolution issue
- Direct connection not accessible (IPv4 compatibility)
- Session Pooler also fails with same error

❌ **Table Creation**
- `time_entries` table doesn't exist
- Cannot create tables without successful migration

---

## Questions for Specialist

1. **Why does DNS resolution fail for `db.oeelxninfrdcacparkra.supabase.co`?**
   - Is this an IPv4/IPv6 compatibility issue?
   - Should the hostname format be different?

2. **Can Drizzle migrations work with Transaction Pooler (port 6543)?**
   - Transaction Pooler works for runtime queries
   - Would it work for migrations if we configure it differently?

3. **Alternative migration strategies:**
   - Can we create tables manually via Supabase SQL editor?
   - Should we use a different migration tool?
   - Is there a way to run migrations through Supabase's API?

4. **Network configuration:**
   - Is there a firewall/proxy blocking direct connections?
   - Should we configure DNS differently?
   - Do we need to purchase Supabase IPv4 add-on?

5. **Connection string format:**
   - Is the Session Pooler connection string format correct?
   - Should we use different parameters for migrations?

---

## Next Steps (Pending Specialist Input)

1. ✅ Runtime connection working - continue using Transaction Pooler
2. ❌ Need solution for migrations - cannot create tables
3. ⏳ Waiting for guidance on:
   - Alternative migration approach
   - Network/DNS configuration
   - Connection string format for migrations

---

## Files Modified During Troubleshooting

1. `src/lib/db.ts` - Switched to postgres-js, added URL encoding
2. `drizzle.config.ts` - Added support for `DATABASE_URL_DIRECT`
3. `.env.local` - Added `DATABASE_URL_DIRECT` variable
4. `package.json` - Added `postgres` package, removed `@neondatabase/serverless` dependency

---

## Schema Definition

The `time_entries` table schema (from `src/lib/schema.ts`):
```typescript
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  jobId: text("job_id").notNull(),
  jobName: text("job_name").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  lunchStart: text("lunch_start").notNull(),
  lunchEnd: text("lunch_end").notNull(),
  totalHours: text("total_hours").notNull(),
  notes: text("notes").default(""),
  changeOrder: text("change_order").default(""),
  createdAt: text("created_at").default(sql`now()`),
}, (table) => ({
  userIdIdx: index("user_id_idx").on(table.userId),
  dateIdx: index("date_idx").on(table.date),
  jobIdIdx: index("job_id_idx").on(table.jobId),
}));
```

---

## Contact Information

**Project:** Roof Worx Time Entry App  
**Database:** Supabase (PostgreSQL)  
**Project Reference:** `oeelxninfrdcacparkra`  
**Region:** `aws-1-us-west-1`

---

*Last Updated: [Current Date]*  
*Status: Blocked on migrations - awaiting specialist guidance*

