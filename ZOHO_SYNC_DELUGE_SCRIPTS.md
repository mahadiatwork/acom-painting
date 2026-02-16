# Zoho CRM → Supabase Sync: Deluge Scripts

This document contains the Deluge scripts for implementing the one-way synchronization from Zoho CRM to Supabase.

## Overview

Two synchronization mechanisms:

1. **Trigger Sync (Real-time)**: Fires when a Deal/Project status changes to "Project Accepted"
2. **Daily Sync (Safety Net)**: Runs once daily to ensure all active projects are synced

Both scripts use the same payload structure and call idempotent endpoints that handle upserts automatically.

---

## Prerequisites

1. **Zoho Org Variable Setup**:
   - Go to **Setup > Developer Space > Org Variables** in Zoho CRM
   - Create a new Org Variable:
     - **Variable Name**: `ZOHO_WEBHOOK_SECRET`
     - **Value**: Your `ZOHO_WEBHOOK_SECRET` from Vercel environment variables
     - **Type**: Text
   - **Important**: The value must match exactly with the `ZOHO_WEBHOOK_SECRET` in your Vercel deployment

2. **Environment Variables**:
   - Ensure `ZOHO_WEBHOOK_SECRET` is set in Vercel
   - App URL: `https://acom-painting.vercel.app`

**Note**: These scripts use manual headers instead of Zoho Connections because OAuth connections are designed for Zoho APIs, not external webhooks. The scripts will retrieve the secret from the Org Variable and add it as an `Authorization: Bearer <secret>` header.

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

// 5. Get webhook secret from Org Variable
secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");

// Debug: Verify secret was retrieved
if (secret == null || secret == "")
{
    info "ERROR: ZOHO_WEBHOOK_SECRET Org Variable is empty or not found!";
    info "Please verify the Org Variable exists and has a value.";
    return;
}

// Trim any whitespace from secret (common issue)
secret = secret.trim();

// 6. Build headers manually (required for external APIs)
headers = Map();
headers.put("Authorization", "Bearer " + secret);
headers.put("Content-Type", "application/json");

// 7. Invoke Supabase sync API with manual headers
url = "https://acom-painting.vercel.app/api/sync/projects/trigger";

// Debug logging
info "Syncing Deal " + dealIdStr + " to Supabase";
info "URL: " + url;
info "Authorization header set (secret length: " + secret.length() + " chars)";

response = invokeurl
[
    url: url
    type: POST
    parameters: payload.toString()
    headers: headers
];

// 8. Log response for audit/debug
info "Trigger Sync Response for Deal " + dealIdStr + ": " + response;

// 9. Check if sync was successful
// IMPORTANT: Check for "success":true (not just "success" which matches false too)
if (response != null && response.contains("\"success\":true"))
{
    info "Project " + dealIdStr + " synced successfully to Supabase";
}
else
{
    // Log error details
    info "ERROR: Failed to sync project " + dealIdStr;
    if (response != null)
    {
        // Try to extract error reason from response
        if (response.contains("\"reason\""))
        {
            // Extract reason value (simple string extraction)
            reasonStart = response.indexOf("\"reason\":\"") + 10;
            reasonEnd = response.indexOf("\"", reasonStart);
            if (reasonEnd > reasonStart)
            {
                reason = response.subString(reasonStart, reasonEnd);
                info "Error Reason: " + reason;
            }
        }
        if (response.contains("\"details\""))
        {
            // Extract details value
            detailsStart = response.indexOf("\"details\":\"") + 12;
            detailsEnd = response.indexOf("\"", detailsStart);
            if (detailsEnd > detailsStart)
            {
                details = response.subString(detailsStart, detailsEnd);
                info "Error Details: " + details;
            }
        }
    }
    info "Full Response: " + response;
    
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

// 1.5. Get webhook secret from Org Variable (once, outside loop)
secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");

// Verify secret was retrieved
if (secret == null || secret == "")
{
    info "ERROR: ZOHO_WEBHOOK_SECRET Org Variable is empty or not found!";
    info "Please verify the Org Variable exists and has a value.";
    return;
}

// Trim any whitespace from secret (common issue)
secret = secret.trim();
info "Secret retrieved (length: " + secret.length() + " chars)";

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
            
            // Build headers manually (secret already retrieved above)
            headers = Map();
            headers.put("Authorization", "Bearer " + secret);
            headers.put("Content-Type", "application/json");
            
            // Call daily sync endpoint with manual headers
            url = "https://acom-painting.vercel.app/api/sync/projects/daily";
            
            response = invokeurl
            [
                url: url
                type: POST
                parameters: payload.toString()
                headers: headers
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

## 3. Painters Webhook (Foreman Model)

**Purpose**: Sync Painter records to Supabase when a crew member is created or updated in Zoho CRM, so Foremen can select them in the "New Timesheet" crew dropdown.

**Workflow Rule Configuration**:
- **Module**: `Painters` (your custom Painters module)
- **When**: `Create` or `Edit`
- **Action**: Call function `sync_painter_to_app`

**Required fields on Painters module**: `Name` (required), `Email`, `Phone`, `Active` (checkbox/boolean). Adjust field API names below if yours differ (e.g. `Full_Name` instead of `Name`).

### Deluge Script

```javascript
/* 
 * Function: sync_painter_to_app
 * Trigger: Workflow Rule on Painters module (Create / Edit)
 * Purpose: Sync painter to Supabase for Foreman timesheet crew dropdown
 */

// 1. Get Painter record (id is passed from workflow - use your workflow's variable name)
//    Common: workflow passes "id" or the record ID field
painterId = id;  // Use the variable your workflow passes (e.g. id, painterId, etc.)
if (painterId == null || painterId == "")
{
    info "ERROR: No Painter ID passed from workflow";
    return;
}

// 2. Get full record from Painters module (replace "Painters" with your module API name if different)
rec = zoho.crm.getRecordById("Painters", painterId);
if (rec == null)
{
    info "ERROR: Could not get Painter record " + painterId;
    return;
}

// 3. Extract fields (use your actual Zoho field API names)
idStr = rec.get("id").toString();
nameVal = ifnull(rec.get("Name"), "");           // Or Full_Name if that's your field
emailVal = rec.get("Email");                     // Can be null
phoneVal = rec.get("Phone");                     // Can be null
activeVal = rec.get("Active");                   // Checkbox: true/false, or 1/0
if (activeVal == null) { activeVal = true; }

// 4. Escape double quotes for JSON (in case name/email/phone contain quotes)
nameStr = nameVal.replace("\"", "\\\"");
emailStr = (emailVal != null ? emailVal.toString() : "").replace("\"", "\\\"");
phoneStr = (phoneVal != null ? phoneVal.toString() : "").replace("\"", "\\\"");

// 5. Build JSON body (Active as boolean)
activeJson = (activeVal == true || activeVal == 1 || activeVal == "1") ? "true" : "false";
jsonBody = "{\"id\":\"" + idStr + "\",\"Name\":\"" + nameStr + "\",\"Email\":\"" + emailStr + "\",\"Phone\":\"" + phoneStr + "\",\"Active\":" + activeJson + "}";

// 6. Get webhook secret from Org Variable
secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");
if (secret == null || secret == "")
{
    info "ERROR: ZOHO_WEBHOOK_SECRET Org Variable is empty or not found";
    return;
}
secret = secret.trim();

// 7. Build headers
headers = Map();
headers.put("Authorization", "Bearer " + secret);
headers.put("Content-Type", "application/json");

// 8. Call webhook
url = "https://acom-painting.vercel.app/api/webhooks/painters";

info "Syncing Painter " + idStr + " to Supabase";

response = invokeurl
[
    url: url
    type: POST
    parameters: jsonBody
    headers: headers
];

// 9. Check response
if (response != null && response.contains("\"success\":true"))
{
    info "Painter " + idStr + " synced successfully";
}
else
{
    info "ERROR: Failed to sync Painter " + idStr + " - " + response;
}
```

### Workflow setup in Zoho CRM

1. Go to **Setup > Automation > Workflow Rules**.
2. Create a new rule on module **Painters**.
3. **When**: Record is created **OR** Record is edited.
4. **Condition**: (optional) e.g. when `Name` is not empty.
5. **Action**: Execute function → choose the function that contains the script above.
6. When configuring the function, pass the **Record ID** (e.g. map the field `id` or "Record Id" to the function parameter `id`). The variable name in the script (`id` in step 1) must match what you pass from the workflow.

### Field mapping reference (Painters)

| Zoho CRM Field (API name) | Payload key | Notes |
|---------------------------|-------------|--------|
| `id`                      | `id`        | Required |
| `Name` (or `Full_Name`)   | `Name`      | Required |
| `Email`                   | `Email`     | Optional |
| `Phone`                   | `Phone`     | Optional |
| `Active`                  | `Active`    | Boolean; default true if missing |

---

## 4. Alternative: Using Zoho Connection (If You Have API Key Connection)

If you have created a Zoho Connection with API Key authentication (not OAuth), you can use it instead of manual headers:

```javascript
// Use connection instead of manual headers
response = invokeurl
[
    url: url
    type: POST
    parameters: payload.toString()
    connection: "acom_painting_app_conn"  // Must be API Key connection, not OAuth
];
```

**Note**: 
- Zoho OAuth connections (like `portal_conn`) are designed for Zoho APIs only and won't work for external webhooks
- If using a connection, it must be configured as:
  - **Authentication Type**: `API Key`
  - **Parameter Name**: `Authorization`
  - **Value**: `Bearer YOUR_ZOHO_WEBHOOK_SECRET`
  - **Add to**: `Header`

---

## 5. Testing the Scripts

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

### Test Painters Webhook

1. Create or edit a Painter in Zoho CRM (Painters module).
2. Check the workflow execution in Zoho (Timeline or Execution Logs).
3. In Supabase Table Editor, open the `painters` table and confirm the record exists or was updated.
4. In the app, open "New Timesheet" and confirm the painter appears in the crew dropdown.

---

## 6. Troubleshooting

### Common Issues

1. **401 Unauthorized**:
   - **Most Common Cause**: Secret mismatch between Zoho and Vercel
   - Verify `ZOHO_WEBHOOK_SECRET` Org Variable exists in Zoho CRM
   - **Critical**: The Org Variable value must match EXACTLY with `ZOHO_WEBHOOK_SECRET` in Vercel (case-sensitive, no extra spaces)
   - To verify:
     1. Copy the value from Zoho Org Variable
     2. Go to Vercel → Your Project → Settings → Environment Variables
     3. Compare `ZOHO_WEBHOOK_SECRET` value character-by-character
   - Check Zoho execution logs for the debug message showing secret length
   - If secret is null/empty in logs, the Org Variable name might be misspelled
   - Ensure there are no leading/trailing spaces (script now trims automatically)

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

## 7. Field Mapping Reference

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

## 8. Next Steps

After setting up the sync scripts:

1. Test both trigger and daily sync
2. Monitor sync health via Vercel logs
3. Set up alerts for sync failures (optional)
4. Review sync performance and optimize if needed
