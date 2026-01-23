# Zoho CRM Lookup Fields Fix

## Problem Summary

When creating time entries in Zoho CRM via the API, we encountered an `INVALID_DATA` error specifically for the `Portal_User` lookup field. The error indicated that Zoho CRM was rejecting the data format we were sending.

### Error Details

```json
{
  "code": "INVALID_DATA",
  "details": {
    "api_name": "Portal_User"
  },
  "message": "invalid data",
  "status": "error"
}
```

## Root Causes

### 1. Incorrect Lookup Field Format

**Problem**: Zoho CRM API v2 requires lookup fields to be sent as objects with an `id` property, not as plain string IDs.

**What we were sending**:
```json
{
  "Job": "6838013000000977057",
  "Portal_User": "6838013000000977001"
}
```

**What Zoho expects**:
```json
{
  "Job": { "id": "6838013000000977057" },
  "Portal_User": { "id": "6838013000000977001" }
}
```

### 2. Hardcoded Portal User ID

**Problem**: The test page was using a hardcoded Portal User ID instead of fetching the actual `zoho_id` from the Supabase `users` table.

**Impact**: 
- Test entries were using incorrect Portal User IDs
- Main time entry flow needed to ensure it was using the correct `zoho_id` from the database

## Solution

### 1. Fixed Lookup Field Format

**File**: `src/lib/zoho.ts`

**Change**: Updated the `createTimeEntry` method to format lookup fields as objects:

```typescript
const zohoPayload: Record<string, any> = {
  Name: entryName,
  Job: { id: data.projectId },                    // ✅ Lookup field format
  Portal_User: { id: data.contractorId },         // ✅ Lookup field format
  Date: data.date,
  Start_Time: startDateTime,
  End_Time: endDateTime,
  Total_Hours: data.totalHours,
  Time_Entry_Note: data.notes || '',
};
```

**Before**:
```typescript
Job: data.projectId,                    // ❌ Plain string
Portal_User: data.contractorId,         // ❌ Plain string
```

**After**:
```typescript
Job: { id: data.projectId },                    // ✅ Object with id
Portal_User: { id: data.contractorId },         // ✅ Object with id
```

### 2. Implemented Dynamic Zoho ID Lookup

**File**: `src/app/api/user/zoho-id/route.ts` (New)

Created a new API endpoint to fetch the logged-in user's `zoho_id` from the Supabase `users` table:

```typescript
export async function GET(request: NextRequest) {
  // 1. Authenticate user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 2. Query Postgres users table for zoho_id
  const [userRecord] = await db
    .select({ zohoId: users.zohoId })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1)

  return NextResponse.json({ 
    zohoId: userRecord.zohoId,
    email: user.email
  })
}
```

**File**: `src/app/(main)/entry/test_new/page.tsx`

Updated the test page to automatically fetch and use the correct `zoho_id`:

```typescript
useEffect(() => {
  const fetchZohoId = async () => {
    const response = await fetch("/api/user/zoho-id");
    const data = await response.json();
    
    if (data.zohoId) {
      setContractorId(data.zohoId); // Auto-populate with actual zoho_id
    }
  };
  fetchZohoId();
}, []);
```

### 3. Enhanced Main Time Entry Flow

**File**: `src/lib/sync-utils.ts`

The main time entry flow already had the correct implementation, but we enhanced it with better logging:

```typescript
// Lookup Portal User ID from email (from Supabase users table)
const contractorId = await getPortalUserIdFromEmail(userEmail)

if (!contractorId) {
  console.warn(`[Sync] Portal User ID not found for ${userEmail}`)
  return
}

console.log(`[Sync] Found Portal User ID for ${userEmail}: ${contractorId}`)
```

The `getPortalUserIdFromEmail` function queries the `users` table:

```typescript
async function getPortalUserIdFromEmail(email: string): Promise<string | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  return user?.zohoId || null
}
```

## Implementation Flow

### Test Page Flow
```
1. User opens /entry/test_new
2. Component fetches zoho_id from /api/user/zoho-id
3. Contractor ID field auto-populates with actual zoho_id
4. User fills form and submits
5. Payload shows correct lookup format: { "Portal_User": { "id": "..." } }
6. Entry successfully created in Zoho CRM
```

### Main Time Entry Flow
```
1. User creates time entry via /entry/new
2. Entry written to Supabase immediately (fast response)
3. Background sync starts (non-blocking)
4. Sync function looks up zoho_id from users table
5. Zoho API called with correct lookup format
6. Entry synced to Zoho CRM
```

## Database Schema

The `users` table in Supabase stores the mapping:

```sql
CREATE TABLE "users" (
  "id" VARCHAR PRIMARY KEY,
  "email" TEXT UNIQUE,
  "zoho_id" VARCHAR,  -- Portal User ID from Zoho CRM
  "username" TEXT,
  "password" TEXT
);
```

The `zoho_id` is populated when:
- A user is provisioned from Zoho via `/api/auth/provision`
- A user webhook is received via `/api/webhooks/users`
- A cron sync runs via `/api/cron/sync-projects`

## Verification

### Success Response from Zoho

After the fix, Zoho CRM returns:

```json
{
  "code": "SUCCESS",
  "details": {
    "id": "6838013000001323001",
    "Created_Time": "2026-01-23T08:26:10-07:00",
    "Modified_Time": "2026-01-23T08:26:10-07:00"
  },
  "message": "record added",
  "status": "success"
}
```

### Payload Format

The correct payload sent to Zoho:

```json
{
  "Name": "Time Entry - 2026-01-23 09:00 to 17:00",
  "Job": { "id": "6838013000000977057" },
  "Portal_User": { "id": "6838013000001274725" },
  "Date": "2026-01-23",
  "Start_Time": "2026-01-23T09:00:00+08:00",
  "End_Time": "2026-01-23T17:00:00+08:00",
  "Total_Hours": "8.00",
  "Time_Entry_Note": "Test entry from UI",
  "Orange_Tape_Roll": 1,
  "Inch_Roller_Cover1": 1
}
```

## Key Takeaways

1. **Zoho CRM API v2 Lookup Fields**: Must be objects with `id` property, not plain strings
2. **Dynamic ID Lookup**: Always fetch `zoho_id` from the database, never hardcode
3. **Database as Source of Truth**: The `users` table maintains the mapping between Supabase users and Zoho Portal Users
4. **Background Sync**: Main time entry flow uses background processing to avoid blocking user response

## Files Modified

1. `src/lib/zoho.ts` - Fixed lookup field format
2. `src/app/api/user/zoho-id/route.ts` - New endpoint for fetching zoho_id
3. `src/app/(main)/entry/test_new/page.tsx` - Auto-fetch zoho_id on load
4. `src/lib/sync-utils.ts` - Enhanced logging for zoho_id lookup
5. `src/app/api/time-entries/route.ts` - Enhanced background sync logging

## Testing

To verify the fix:

1. **Test Page**: Navigate to `/entry/test_new`
   - Contractor ID should auto-populate with your actual `zoho_id`
   - Submit form and verify success response from Zoho

2. **Main Form**: Navigate to `/entry/new`
   - Create a time entry
   - Check Vercel logs for background sync
   - Verify entry appears in Zoho CRM

3. **Database Check**: Query Supabase `users` table
   ```sql
   SELECT email, zoho_id FROM users WHERE email = 'your-email@example.com';
   ```

## Related Documentation

- [Zoho CRM API v2 Documentation](https://www.zoho.com/crm/developer/docs/api/v2/)
- [Zoho Lookup Fields](https://www.zoho.com/crm/developer/docs/api/v2/insert-records.html#lookup-fields)
