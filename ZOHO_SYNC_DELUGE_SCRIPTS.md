# Zoho CRM → Supabase Sync: Deluge Scripts

This document contains the Deluge scripts for implementing the one-way synchronization from Zoho CRM to Supabase.

## Overview

Two synchronization mechanisms:

1. **Trigger Sync (Real-time)**: Fires when a Deal/Project status changes to "Project Accepted"
2. **Daily Sync (Safety Net)**: Runs once daily to ensure all active projects are synced

Both scripts use the same payload structure and call idempotent endpoints that handle upserts automatically.

---

## Prerequisites

1. **Zoho Connection Setup**:
   - Create a Connection named `acom_painting_app_conn` in Zoho CRM
   - Set Authentication Type: `API Key`
   - Parameter Name: `Authorization`
   - Value: `Bearer YOUR_ZOHO_WEBHOOK_SECRET` (from Vercel environment variables)
   - Add to: `Header`

2. **Environment Variables**:
   - Ensure `ZOHO_WEBHOOK_SECRET` is set in Vercel
   - App URL: `https://acom-painting.vercel.app`

---

## 1. Trigger Sync Script

**Purpose**: Real-time sync when a project status changes to "Project Accepted"

**Workflow Rule Configuration**:
- **Module**: `Deals` (or your Projects module)
- **When**: `Edit` / `Field Update`
- **Condition**: `Stage` changes to `"Project Accepted"`
- **Action**: Call function `trigger_sync_project`

### Deluge Script

```javascript
/* 
 * Function: trigger_sync_project
 * Trigger: Workflow Rule on Deals module
 * Purpose: Real-time sync when project status changes to "Project Accepted"
 */

// 1. Get Deal Record
deal = zoho.crm.getRecordById("Deals", dealId);  // 'dealId' passed from workflow

// 2. Guard clause - verify status
status = deal.get("Stage");
if (status != "Project Accepted")
{
    info "Skipping sync - status is not 'Project Accepted'. Current status: " + status;
    return;
}

// 3. Extract Deal fields - only essential fields
dealIdStr = deal.get("id").toString();
dealName = deal.get("Deal_Name");

// Get date - prefer Closing_Date, fallback to Project_Start_Date
dealDate = "";
if (deal.get("Closing_Date") != null)
{
    dealDate = deal.get("Closing_Date");
}
else if (deal.get("Project_Start_Date") != null)
{
    dealDate = deal.get("Project_Start_Date");
}

// Get address - prefer Shipping_Street, or combine address fields
dealAddress = "";
if (deal.get("Shipping_Street") != null && deal.get("Shipping_Street") != "")
{
    dealAddress = deal.get("Shipping_Street");
}
else
{
    // Combine address components if Shipping_Street is not available
    street = ifnull(deal.get("Single_Line_1"), "");
    city = ifnull(deal.get("Single_Line_2"), "");
    state = ifnull(deal.get("State"), "");
    zipCode = ifnull(deal.get("Zip_Code"), "");
    
    // Build combined address
    addressParts = list();
    if (street != "") addressParts.add(street);
    if (city != "") addressParts.add(city);
    if (state != "") addressParts.add(state);
    if (zipCode != "") addressParts.add(zipCode);
    
    dealAddress = addressParts.toString(", ");
}

// 4. Build payload map - only essential fields
payload = Map();
payload.put("zoho_record_id", dealIdStr);
payload.put("name", dealName);
payload.put("status", status);
payload.put("date", dealDate);
payload.put("address", dealAddress);
payload.put("sync_source", "trigger");

// 5. Invoke Supabase sync API using Connection
url = "https://acom-painting.vercel.app/api/sync/projects/trigger";

response = invokeurl
[
    url: url
    type: POST
    parameters: payload.toString()
    connection: "acom_painting_app_conn"
];

// 6. Log response for audit/debug
info "Trigger Sync Response for Deal " + dealIdStr + ": " + response;

// 7. Check if sync was successful
if (response != null && response.contains("success"))
{
    info "Project " + dealIdStr + " synced successfully to Supabase";
}
else
{
    info "ERROR: Failed to sync project " + dealIdStr + ". Response: " + response;
    // Optional: Add note to Deal record for tracking
    // zoho.crm.addNotes("Deals", dealIdStr, "Sync failed: " + response);
}
```

---

## 2. Daily Sync Script

**Purpose**: Safety net sync to ensure all active projects are synced, even if trigger sync failed

**Scheduler Configuration**:
- **Type**: Scheduled Function in Zoho CRM
- **Frequency**: Daily
- **Time**: Off-peak hours (e.g., 2:00 AM)
- **Function Name**: `daily_sync_projects`

### Deluge Script

```javascript
/* 
 * Function: daily_sync_projects
 * Trigger: Scheduled Function (Daily)
 * Purpose: Safety net sync - ensures all active projects are synced
 */

// 1. Generate sync run ID for correlation
currentTime = zoho.currenttime;
syncRunId = currentTime.toString("yyyy-MM-dd") + "-daily-" + currentTime.toString("HHmmss");

info "Starting daily sync run: " + syncRunId;

// 2. Pagination settings
page = 1;
perPage = 200;  // Zoho API limit
moreRecords = true;
totalProcessed = 0;
totalSuccess = 0;
totalErrors = 0;
errorsList = list();

// 3. Define active statuses (adjust based on your business logic)
// Only sync projects that are in "active" statuses
activeStatuses = {"Project Accepted", "In Progress", "Pending Install"};

// 4. Loop through all active projects
while (moreRecords)
{
    // Build criteria for active projects
    // Note: Adjust the criteria based on your Zoho module structure
    criteria = "(Stage:equals:Project Accepted)";
    // For multiple statuses, you might need multiple API calls or use OR conditions
    
    deals = zoho.crm.getRecords("Deals", page, perPage, {"criteria":criteria});
    
    if (deals == null || deals.size() == 0)
    {
        moreRecords = false;
        break;
    }
    
    info "Processing page " + page + " with " + deals.size() + " deals";
    
    // 5. Process each deal
    for each deal in deals
    {
        try
        {
            dealIdStr = deal.get("id").toString();
            status = deal.get("Stage");
            
            // Skip if not in active statuses (defensive check)
            if (!activeStatuses.contains(status))
            {
                info "Skipping Deal " + dealIdStr + " - status: " + status;
                continue;
            }
            
            // Extract Deal fields - only essential fields
            dealName = deal.get("Deal_Name");
            
            // Get date - prefer Closing_Date, fallback to Project_Start_Date
            dealDate = "";
            if (deal.get("Closing_Date") != null)
            {
                dealDate = deal.get("Closing_Date");
            }
            else if (deal.get("Project_Start_Date") != null)
            {
                dealDate = deal.get("Project_Start_Date");
            }
            
            // Get address - prefer Shipping_Street, or combine address fields
            dealAddress = "";
            if (deal.get("Shipping_Street") != null && deal.get("Shipping_Street") != "")
            {
                dealAddress = deal.get("Shipping_Street");
            }
            else
            {
                // Combine address components if Shipping_Street is not available
                street = ifnull(deal.get("Single_Line_1"), "");
                city = ifnull(deal.get("Single_Line_2"), "");
                state = ifnull(deal.get("State"), "");
                zipCode = ifnull(deal.get("Zip_Code"), "");
                
                // Build combined address
                addressParts = list();
                if (street != "") addressParts.add(street);
                if (city != "") addressParts.add(city);
                if (state != "") addressParts.add(state);
                if (zipCode != "") addressParts.add(zipCode);
                
                dealAddress = addressParts.toString(", ");
            }
            
            // Build payload map - only essential fields
            payload = Map();
            payload.put("zoho_record_id", dealIdStr);
            payload.put("name", dealName);
            payload.put("status", status);
            payload.put("date", dealDate);
            payload.put("address", dealAddress);
            payload.put("sync_source", "daily");
            payload.put("sync_run_id", syncRunId);
            
            // Call daily sync endpoint
            url = "https://acom-painting.vercel.app/api/sync/projects/daily";
            
            response = invokeurl
            [
                url: url
                type: POST
                parameters: payload.toString()
                connection: "acom_painting_app_conn"
            ];
            
            totalProcessed = totalProcessed + 1;
            
            // Check if sync was successful
            if (response != null && response.contains("success"))
            {
                totalSuccess = totalSuccess + 1;
                info "Daily Sync OK for Deal " + dealIdStr + " (run: " + syncRunId + ")";
            }
            else
            {
                totalErrors = totalErrors + 1;
                errorMsg = "Deal " + dealIdStr + ": " + response;
                errorsList.add(errorMsg);
                info "Daily Sync ERROR for Deal " + dealIdStr + ": " + response;
            }
        }
        catch (e)
        {
            // Log but don't stop entire run
            totalErrors = totalErrors + 1;
            dealIdStr = "unknown";
            try
            {
                dealIdStr = deal.get("id").toString();
            }
            catch (ex)
            {
                // Ignore
            }
            errorMsg = "Deal " + dealIdStr + ": Exception - " + e.toString();
            errorsList.add(errorMsg);
            info "Daily Sync EXCEPTION for Deal " + dealIdStr + ": " + e.toString();
        }
    }
    
    // Prepare for next page
    if (deals.size() < perPage)
    {
        moreRecords = false;
    }
    else
    {
        page = page + 1;
    }
}

// 6. Summary logging
info "Daily Sync Complete (run: " + syncRunId + ")";
info "Total Processed: " + totalProcessed;
info "Total Success: " + totalSuccess;
info "Total Errors: " + totalErrors;

// 7. Optional: Send summary email to admin if errors occurred
if (totalErrors > 0)
{
    errorSummary = "Daily Sync Report for " + syncRunId + "\n\n";
    errorSummary = errorSummary + "Total Processed: " + totalProcessed + "\n";
    errorSummary = errorSummary + "Total Success: " + totalSuccess + "\n";
    errorSummary = errorSummary + "Total Errors: " + totalErrors + "\n\n";
    errorSummary = errorSummary + "Errors:\n";
    
    for each error in errorsList
    {
        errorSummary = errorSummary + "- " + error + "\n";
    }
    
    // Send email to admin (adjust email address)
    sendmail
    [
        from: zoho.adminuserid
        to: "admin@acompainting.com"  // Replace with your admin email
        subject: "Daily Sync Errors - " + syncRunId
        message: errorSummary
    ];
    
    info "Error summary email sent";
}
```

---

## 3. Alternative: Manual Headers (If Not Using Connection)

If you prefer not to use a Zoho Connection, you can use manual headers:

```javascript
// Get secret from Org Variable (set this up in Zoho)
secret = zoho.crm.getOrgVariable("ACOM_PAINTING_WEBHOOK_SECRET");

// Build headers manually
headers = Map();
headers.put("Authorization", "Bearer " + secret);
headers.put("Content-Type", "application/json");

// Use headers in invokeurl
response = invokeurl
[
    url: url
    type: POST
    parameters: payload.toString()
    headers: headers
];
```

**Note**: Make sure to set up the Org Variable `ACOM_PAINTING_WEBHOOK_SECRET` in Zoho CRM:
- Go to **Setup > Developer Space > Org Variables**
- Create variable: `ACOM_PAINTING_WEBHOOK_SECRET`
- Value: Your `ZOHO_WEBHOOK_SECRET` from Vercel

---

## 4. Testing the Scripts

### Test Trigger Sync

1. Create or edit a Deal in Zoho CRM
2. Change the `Stage` field to `"Project Accepted"`
3. Check the Timeline in Zoho to see if the function executed
4. Verify in Supabase that the project was created/updated
5. Check Vercel logs for any errors

### Test Daily Sync

1. Manually trigger the scheduled function in Zoho CRM
2. Check the execution logs
3. Verify projects in Supabase are updated
4. Check Vercel logs for the sync requests

---

## 5. Troubleshooting

### Common Issues

1. **401 Unauthorized**:
   - Verify `ZOHO_WEBHOOK_SECRET` matches in both Zoho Connection and Vercel
   - Check that the Authorization header is being sent correctly

2. **404 Not Found**:
   - Verify the URL is correct: `https://acom-painting.vercel.app/api/sync/projects/trigger`
   - Check that the route files exist in your deployment

3. **400 Validation Error**:
   - Check that all required fields are present in the payload
   - Verify field names match the expected schema

4. **500 Internal Server Error**:
   - Check Vercel logs for database connection issues
   - Verify Supabase connection string is correct

### Debugging Tips

- Add `info` statements throughout the Deluge script to log intermediate values
- Check Zoho CRM Timeline for function execution logs
- Check Vercel function logs for API endpoint logs
- Use Supabase Table Editor to verify data was inserted/updated

---

## 6. Field Mapping Reference

| Zoho CRM Field | Payload Key | Notes |
|----------------|-------------|-------|
| `id` | `zoho_record_id` | Deal/Project ID |
| `Deal_Name` | `name` | Project name (required) |
| `Stage` | `status` | Project status (required) |
| `Closing_Date` or `Project_Start_Date` | `date` | Project date (optional) |
| `Shipping_Street` or combined address fields | `address` | Project address (optional) |

**Address Field Priority:**
1. `Shipping_Street` (if available)
2. Combined: `Single_Line_1` (Street) + `Single_Line_2` (City) + `State` + `Zip_Code`

**Date Field Priority:**
1. `Closing_Date` (if available)
2. `Project_Start_Date` (fallback)

---

## 7. Next Steps

After setting up the sync scripts:

1. Test both trigger and daily sync
2. Monitor sync health via Vercel logs
3. Set up alerts for sync failures (optional)
4. Review sync performance and optimize if needed
