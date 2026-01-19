# Zoho CRM Real-Time Sync Guide

This guide covers setting up **3 Webhooks** to ensure instant synchronization of Data, Users, and Assignments.

## 1. Projects (Deals) Webhook
*Updates project details (Address, Colors, etc.) immediately.*

1.  **Workflow Rule:**
    *   **Module:** `Deals`
    *   **When:** Create / Edit
2.  **Deluge Script (`sync_deal_to_app`):**
    ```javascript
    // ... (Get Deal details as before) ...
    
    url = "https://acom-painting.vercel.app/api/webhooks/projects";
    // ... (Send POST with JSON) ...
    ```
    *(See previous guides for full script)*

---

## 2. Assignments Webhook (Instant Access)
*Grant access to a user immediately when a connection is created.*

1.  **Workflow Rule:**
    *   **Module:** `Portal_Us_X_Job_Ticke` (Junction Module)
    *   **When:** Create
2.  **Deluge Script (`sync_assignment_to_app`):**

    ```javascript
    /* 
     * Function: sync_assignment_to_app
     * Trigger: Workflow on Portal_Us_X_Job_Ticke
     */
    
    // Get Record
    rec = zoho.crm.getRecordById("Portal_Us_X_Job_Ticke", id);
    
    // Get Lookups (IDs)
    portalUser = rec.get("Portal_User");
    deal = rec.get("Job_Ticket"); // Check API Name
    
    if (portalUser != null && deal != null) {
        payload = Map();
        payload.put("portalUserId", portalUser.get("id"));
        payload.put("dealId", deal.get("id"));
        payload.put("action", "add");
        
        url = "https://acom-painting.vercel.app/api/webhooks/assignments";
        
        headers = Map();
        headers.put("x-roofworx-secret", "YOUR_WEBHOOK_SECRET");
        
        response = invokeurl
        [
            url: url
            type: POST
            parameters: payload.toString()
            headers: headers
            content-type: "application/json"
        ];
        info response;
    }
    ```

---

## 3. Users Webhook (Instant Mapping)
*Register new users immediately so assignments work.*

1.  **Workflow Rule:**
    *   **Module:** `Portal_Users`
    *   **When:** Create / Edit (Email change)
2.  **Deluge Script (`sync_user_to_app`):**

    ```javascript
    /* 
     * Function: sync_user_to_app
     * Trigger: Workflow on Portal_Users
     */
    
    // Get Record
    userRec = zoho.crm.getRecordById("Portal_Users", id);
    
    payload = Map();
    payload.put("id", userRec.get("id"));
    payload.put("Email", userRec.get("Email"));
    
    url = "https://acom-painting.vercel.app/api/webhooks/users";
    
    headers = Map();
    headers.put("x-roofworx-secret", "YOUR_WEBHOOK_SECRET");
    
    response = invokeurl
    [
        url: url
        type: POST
        parameters: payload.toString()
        headers: headers
        content-type: "application/json"
    ];
    info response;
    ```

---

## 4. Scheduled Sync (Safety Net)
Keep the nightly Cron Job to fix any missed webhooks or deleted records.
-   **Endpoint:** `/api/cron/sync-projects`
