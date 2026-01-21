# Test Zoho CRM Sync - Direct API Test

This document explains how to test the Zoho CRM integration directly, bypassing Supabase.

## Purpose

This test route helps debug Zoho integration issues by:
1. Sending data directly to Zoho CRM API
2. Bypassing Supabase database operations
3. Showing detailed error messages from Zoho
4. Verifying field mappings and authentication

## Test Endpoint

**URL:** `https://acom-painting.vercel.app/api/test/zoho-sync`

### GET Request - View Test Info

```bash
curl https://acom-painting.vercel.app/api/test/zoho-sync
```

Returns:
- Endpoint usage information
- Example payload
- Current Zoho configuration status

### POST Request - Test Zoho Sync

```bash
curl -X POST https://acom-painting.vercel.app/api/test/zoho-sync \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "6838013000000977057",
    "contractorId": "6838013000000977001",
    "date": "2026-01-21",
    "startTime": "09:00",
    "endTime": "17:00",
    "lunchStart": "12:00",
    "lunchEnd": "13:00",
    "totalHours": "8.00",
    "notes": "Test entry from API",
    "sundryItems": {
      "Masking_Paper_Roll": 2,
      "Plastic_Roll": 1,
      "Tip": 5
    }
  }'
```

## Using in Browser Console

You can also test directly from the browser console:

```javascript
fetch('/api/test/zoho-sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: '6838013000000977057', // Replace with actual Deal ID
    contractorId: '6838013000000977001', // Replace with actual Portal User ID
    date: '2026-01-21',
    startTime: '09:00',
    endTime: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    totalHours: '8.00',
    notes: 'Test entry',
    sundryItems: {
      Masking_Paper_Roll: 2,
      Plastic_Roll: 1,
      Tip: 5,
    }
  })
})
.then(res => res.json())
.then(data => console.log('Success:', data))
.catch(err => console.error('Error:', err))
```

## Required Data

### projectId (Deal ID)
- Get from Zoho CRM → Deals module
- Find a Deal/Project record
- Copy the ID (numeric string like `6838013000000977057`)

### contractorId (Portal User ID)
- Get from Zoho CRM → Portal Users module
- Find the Portal User record
- Copy the ID (numeric string like `6838013000000977001`)

## What to Check

1. **Authentication:**
   - Check if `ZOHO_ACCESS_TOKEN_URL` or `ZOHO_CLIENT_ID` + `ZOHO_REFRESH_TOKEN` are set
   - Verify access token is being retrieved successfully

2. **Field Mappings:**
   - Verify all field names match Zoho API names exactly
   - Check DateTime format: `yyyy-MM-ddTHH:mm:ss±HH:mm`

3. **Lookup Fields:**
   - `Job` field should be a valid Deal ID
   - `Portal_User` field should be a valid Portal User ID

4. **Error Responses:**
   - Check the error response from Zoho for specific field issues
   - Common errors:
     - Invalid lookup field (wrong ID format)
     - Invalid DateTime format
     - Missing required fields
     - Field doesn't exist in Zoho module

## Expected Response

### Success:
```json
{
  "success": true,
  "message": "Test entry created in Zoho CRM",
  "zohoResponse": {
    "id": "6838013000001234567",
    "code": "SUCCESS"
  },
  "testData": { ... }
}
```

### Error:
```json
{
  "success": false,
  "error": "Failed to create test entry in Zoho",
  "details": {
    "message": "...",
    "code": "...",
    "response": {
      "status": 400,
      "statusText": "Bad Request",
      "data": {
        "code": "INVALID_DATA",
        "details": { ... }
      }
    }
  }
}
```

## Troubleshooting

1. **401 Unauthorized:**
   - Check Zoho access token configuration
   - Verify `ZOHO_ACCESS_TOKEN_URL` or OAuth credentials

2. **400 Bad Request:**
   - Check field names match Zoho API exactly
   - Verify DateTime format
   - Check lookup field IDs are valid

3. **404 Not Found:**
   - Verify module name is correct (`Time_Sheets`)
   - Check API domain is correct

4. **500 Internal Server Error:**
   - Check Zoho API logs
   - Verify all required fields are present

## Next Steps

Once the test route works:
1. Verify the exact payload format that Zoho accepts
2. Update the sync utils to match the working format
3. Test the full flow (Supabase → Zoho)
