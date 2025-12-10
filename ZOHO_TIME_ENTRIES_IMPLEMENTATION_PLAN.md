# Zoho Time Entries Implementation Plan

## Overview
Implement proper mapping of time entry data to Zoho CRM's `Time_Sheets` module with correct field mappings and timezone handling.

## Current Issues

1. **Wrong Module Name:** Currently using `Time_Entries`, should be `Time_Sheets`
2. **Incorrect Field Mappings:** Using wrong API field names
3. **Missing Timezone Handling:** DateTime fields need timezone offset format
4. **Missing Lookup Fields:** Need to map `Project` (Deal) and `Contractor` (Portal User) as lookup fields

## Zoho CRM API Field Mappings

### From Screenshots - Time_Sheets Module Fields:

| Field Label | API Name | Data Type | Custom Field | Our Data Source |
|------------|----------|-----------|--------------|-----------------|
| Time Sheet Name | `Name` | Single Line | No | Auto-generate (e.g., "Time Entry - {date}") |
| Project | `Project` | Lookup | Yes | `jobId` (Deal ID) |
| Contractor | `Contractor` | Lookup | No | Portal User ID (from email lookup) |
| Time Entry Date | `Time_Entry_Date` | Date | Yes | `date` (YYYY-MM-DD) |
| Start Time | `Start_Time` | DateTime | Yes | `date` + `startTime` + timezone |
| End Time | `End_Time` | DateTime | No | `date` + `endTime` + timezone |
| Task Note | `Task_Note` | Multi Line (Large) | Yes | `notes` |

### Fields NOT in Zoho (Remove from mapping):
- ❌ `Lunch_Start` - Not in API
- ❌ `Lunch_End` - Not in API  
- ❌ `Total_Hours` - Not in API
- ❌ `Change_Order` - Not in API

## Implementation Steps

### Step 1: Update Zoho Client Method
**File:** `src/lib/zoho.ts`

**Changes:**
1. Change module name from `Time_Entries` to `Time_Sheets`
2. Update method signature to accept properly formatted data
3. Add helper method to format DateTime with timezone

**New Method:**
```typescript
/**
 * Formats a date and time string into Zoho DateTime format with timezone
 * Format: 2020-12-09T17:25:24-07:00
 */
private formatZohoDateTime(date: string, time: string, timezone: string): string {
  // Combine date (YYYY-MM-DD) + time (HH:MM) + timezone offset
  // Example: "2024-01-15" + "09:00" + "-07:00" = "2024-01-15T09:00:00-07:00"
  return `${date}T${time}:00${timezone}`
}

async createTimeEntry(data: {
  projectId: string,        // Deal ID for Project lookup
  contractorId: string,     // Portal User ID for Contractor lookup
  date: string,             // YYYY-MM-DD
  startTime: string,        // HH:MM
  endTime: string,          // HH:MM
  notes?: string,            // Task_Note
  timezone: string          // -07:00 format
}) {
  try {
    if (!this.accessTokenUrl && (!this.clientId || !this.refreshToken)) {
      return { id: 'mock-id-123' };
    }
    
    const token = await this.getAccessToken();
    
    // Format DateTime fields with timezone
    const startDateTime = this.formatZohoDateTime(data.date, data.startTime, data.timezone);
    const endDateTime = this.formatZohoDateTime(data.date, data.endTime, data.timezone);
    
    // Auto-generate Name field
    const entryName = `Time Entry - ${data.date} ${data.startTime} to ${data.endTime}`;
    
    const zohoPayload = {
      Name: entryName,
      Project: data.projectId,                    // Lookup field (Deal ID)
      Contractor: data.contractorId,              // Lookup field (Portal User ID)
      Time_Entry_Date: data.date,                 // Date field (YYYY-MM-DD)
      Start_Time: startDateTime,                  // DateTime with timezone
      End_Time: endDateTime,                      // DateTime with timezone
      Task_Note: data.notes || '',                // Multi Line
    };
    
    const response = await axios.post(
      `${this.apiDomain}/crm/v2/Time_Sheets`,  // Changed from Time_Entries
      { data: [zohoPayload] },
      {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      }
    );
    
    return response.data.data[0];
  } catch (error) {
    console.error('Zoho API Error (createTimeEntry):', error);
    throw error;
  }
}
```

### Step 2: Create Timezone Utility
**File:** `src/lib/timezone.ts` (NEW)

**Purpose:** Get user's timezone and format it for Zoho

```typescript
/**
 * Gets the user's timezone offset in format required by Zoho
 * Returns: "-07:00" or "+05:30" format
 */
export function getUserTimezoneOffset(): string {
  const date = new Date();
  const offset = -date.getTimezoneOffset(); // Note: negative because getTimezoneOffset returns opposite
  
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset >= 0 ? '+' : '-';
  
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Alternative: Get timezone from browser if available
 * Falls back to server timezone
 */
export function getTimezoneFromRequest(request?: Request): string {
  // Try to get from Accept-Language or custom header if sent from client
  // For now, use server timezone (can be enhanced later)
  return getUserTimezoneOffset();
}
```

### Step 3: Update Sync Utils
**File:** `src/lib/sync-utils.ts`

**Changes:**
1. Add function to lookup Portal User ID from email
2. Update `syncToPermanentStorage` to use correct Zoho field mappings
3. Add timezone handling

**New Helper:**
```typescript
/**
 * Looks up Portal User ID from email using Redis map
 */
async function getPortalUserIdFromEmail(email: string): Promise<string | null> {
  try {
    // Reverse lookup: email -> user ID
    // We need to scan the map or store reverse mapping
    // For now, fetch from Zoho API (can be optimized with reverse map)
    const portalUsers = await zohoClient.getPortalUsers();
    const user = portalUsers.find((u: any) => u.Email === email);
    return user?.id || null;
  } catch (error) {
    console.error('[Sync] Failed to lookup Portal User ID:', error);
    return null;
  }
}
```

**Updated syncToPermanentStorage:**
```typescript
export async function syncToPermanentStorage(
  entryData: TimeEntryData, 
  userEmail: string
): Promise<void> {
  try {
    console.log(`[Sync] Starting sync for entry ${entryData.id}`)

    // 1. Write to Postgres (unchanged)
    const postgresData = {
      id: entryData.id,
      userId: entryData.userId,
      jobId: entryData.jobId,
      jobName: entryData.jobName,
      date: entryData.date,
      startTime: entryData.startTime,
      endTime: entryData.endTime,
      lunchStart: entryData.lunchStart || '',
      lunchEnd: entryData.lunchEnd || '',
      totalHours: entryData.totalHours,
      notes: entryData.notes || '',
      changeOrder: entryData.changeOrder || '',
    }

    await db.insert(timeEntries).values(postgresData).onConflictDoNothing()
    console.log(`[Sync] Written to Postgres: ${entryData.id}`)

    // 2. Write to Zoho CRM (UPDATED)
    try {
      // Lookup Portal User ID from email
      const contractorId = await getPortalUserIdFromEmail(userEmail);
      
      if (!contractorId) {
        console.warn(`[Sync] Portal User ID not found for ${userEmail}, skipping Zoho sync`);
        // Still mark as synced (Postgres succeeded)
        await updateRedisSyncedFlag(entryData.id);
        return;
      }

      // Get timezone offset
      const timezone = getUserTimezoneOffset();
      
      const zohoData = {
        projectId: entryData.jobId,              // Deal ID
        contractorId: contractorId,              // Portal User ID
        date: entryData.date,                     // YYYY-MM-DD
        startTime: entryData.startTime,           // HH:MM
        endTime: entryData.endTime,               // HH:MM
        notes: entryData.notes || '',             // Task_Note
        timezone: timezone,                       // -07:00 format
      }

      await zohoClient.createTimeEntry(zohoData)
      console.log(`[Sync] Written to Zoho: ${entryData.id}`)
    } catch (zohoError) {
      console.error(`[Sync] Zoho sync failed for ${entryData.id}:`, zohoError)
      // Don't throw - Postgres is source of truth
    }

    // 3. Update Redis: Mark as synced
    await updateRedisSyncedFlag(entryData.id);
    
  } catch (error) {
    console.error(`[Sync] Failed to sync entry ${entryData.id}:`, error)
    // Don't throw - let it be retried later
  }
}

async function updateRedisSyncedFlag(entryId: string) {
  const entryKey = `entry:${entryId}`
  const existingJson = await redis.hget<string>(entryKey)
  if (existingJson) {
    const existing = JSON.parse(existingJson)
    const updated = { ...existing, synced: true }
    await redis.hset(entryKey, JSON.stringify(updated))
    console.log(`[Sync] Updated Redis synced flag: ${entryId}`)
  }
}
```

### Step 4: Optimize Portal User Lookup (Optional Enhancement)

**Option A: Store Reverse Map in Redis**
- During cron sync, also store `email -> portal_user_id` map
- Faster lookups without API calls

**Option B: Cache Portal User IDs**
- Store in Redis with TTL
- Refresh periodically

**For MVP:** Use Option A - add to cron sync

**File:** `src/app/api/cron/sync-projects/route.ts`

**Add:**
```typescript
// Store reverse map: email -> portal_user_id
const emailToUserIdMap: Record<string, string> = {}
for (const [userId, email] of userMap.entries()) {
  emailToUserIdMap[email] = userId
}

if (Object.keys(emailToUserIdMap).length > 0) {
  await redis.del('zoho:map:email_to_user_id')
  await redis.hset('zoho:map:email_to_user_id', emailToUserIdMap)
}
```

**Then update `getPortalUserIdFromEmail`:**
```typescript
async function getPortalUserIdFromEmail(email: string): Promise<string | null> {
  try {
    const userId = await redis.hget<string>('zoho:map:email_to_user_id', email);
    return userId || null;
  } catch (error) {
    console.error('[Sync] Failed to lookup Portal User ID:', error);
    return null;
  }
}
```

## Testing Checklist

- [ ] Test timezone formatting (various timezones)
- [ ] Test with valid Portal User email
- [ ] Test with invalid/missing Portal User (graceful failure)
- [ ] Test with valid Deal ID (Project lookup)
- [ ] Test with invalid Deal ID (should fail gracefully)
- [ ] Verify DateTime format matches Zoho requirements
- [ ] Verify Name field is auto-generated correctly
- [ ] Test end-to-end: Form submission → Redis → Postgres → Zoho

## Error Handling

1. **Missing Portal User ID:**
   - Log warning
   - Skip Zoho sync
   - Still mark as synced (Postgres succeeded)

2. **Invalid Project ID:**
   - Zoho API will return error
   - Log error
   - Don't mark as synced (will retry)

3. **Timezone Issues:**
   - Use server timezone as fallback
   - Log timezone used for debugging

## Migration Notes

- Existing entries in Redis/Postgres won't have Portal User ID
- Old entries will fail Zoho sync until retried
- New entries will work correctly

## Future Enhancements

1. **Client-Side Timezone Detection:**
   - Send timezone from browser
   - Store in user preferences
   - Use for all time entries

2. **Better Name Generation:**
   - Include job name: "Time Entry - {Job Name} - {Date}"
   - Make it configurable

3. **Validation:**
   - Validate Project ID exists before submission
   - Validate Contractor ID exists before submission

