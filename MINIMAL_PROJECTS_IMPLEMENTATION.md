# Minimal Projects Table Implementation Summary

## Overview

The projects table has been simplified to only store the essential fields:
- **id** (Zoho Deal ID - primary key)
- **name** (Deal name)
- **status** (Project status - for filtering "Project Accepted")
- **date** (Project date)
- **address** (Project address)
- **created_at** (Timestamp)
- **updated_at** (Timestamp)

## Files Updated

### 1. Schema (`src/lib/schema.ts`)
- Removed: `customer`, `salesRep`, `supplierColor`, `trimColor`, `accessoryColor`, `gutterType`, `sidingStyle`, `workOrderLink`
- Kept: `id`, `name`, `status`, `date`, `address`, `createdAt`, `updatedAt`
- Updated indexes: Removed `customerIdx`, added `nameIdx`

### 2. Sync Routes
- **`src/app/api/sync/projects/trigger/route.ts`**: Updated to only sync name, status, date, address
- **`src/app/api/sync/projects/daily/route.ts`**: Updated to only sync name, status, date, address

### 3. Webhook Route
- **`src/app/api/webhooks/projects/route.ts`**: Updated to extract date and address from Zoho payload and only store minimal fields

### 4. Cron Sync Route
- **`src/app/api/cron/sync-projects/route.ts`**: Updated to transform Zoho deals to minimal schema

### 5. Projects API
- **`src/app/api/projects/route.ts`**: Already correct - returns only id, name, status, date, address

### 6. Zoho Client
- **`src/lib/zoho.ts`**: Updated `getDeals()` to fetch only required fields:
  - `id`, `Deal_Name`, `Stage`
  - `Closing_Date`, `Project_Start_Date` (for date)
  - `Shipping_Street`, `Single_Line_1`, `Single_Line_2`, `State`, `Zip_Code` (for address)

## Field Mapping

| Zoho CRM API Name | Database Column | Notes |
|-------------------|-----------------|-------|
| `id` | `id` | Primary key |
| `Deal_Name` | `name` | Required |
| `Stage` | `status` | Required (used to filter "Project Accepted") |
| `Closing_Date` or `Project_Start_Date` | `date` | Optional - prefers Closing_Date |
| `Shipping_Street` or combined address | `address` | Optional - prefers Shipping_Street, falls back to combining Single_Line_1, Single_Line_2, State, Zip_Code |

## Next Steps

1. **Test the Sync Routes**:
   - Test `/api/sync/projects/trigger` with a sample payload
   - Test `/api/sync/projects/daily` with a sample payload

2. **Set Up Zoho Deluge Scripts**:
   - Use the updated scripts from `ZOHO_SYNC_DELUGE_SCRIPTS.md`
   - The scripts now only send: `zoho_record_id`, `name`, `status`, `date`, `address`

3. **Verify Data**:
   - Check Supabase to ensure projects are being stored correctly
   - Verify the `/api/projects` endpoint returns only the 4 essential fields

4. **Deploy**:
   - Commit and push changes
   - Deploy to Vercel
   - Test the live endpoints

## Testing Payload Example

For testing the sync routes, use this payload structure:

```json
{
  "zoho_record_id": "1234567890",
  "name": "Test Project",
  "status": "Project Accepted",
  "date": "2025-01-20",
  "address": "123 Main St, City, State 12345",
  "sync_source": "trigger"
}
```

## Notes

- The `status` field is required and defaults to "Project Accepted" in the schema
- The `date` and `address` fields are optional (can be empty strings)
- All other fields from the old schema have been removed
- The table structure matches your Supabase minimal projects table
