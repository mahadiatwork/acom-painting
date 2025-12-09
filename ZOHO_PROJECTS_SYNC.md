# Zoho CRM Data Synchronization Guide

This guide covers the **User-Scoped** synchronization architecture, ensuring users only see projects associated with them via the `Portal_Us_X_Job_Ticke` module.

## 1. Architecture Overview

-   **Source of Truth:** Zoho CRM.
-   **Performance Layer:** Upstash Redis (Cache).
-   **Strategy:**
    1.  **Global Data:** We fetch ALL Deals and store detailed JSON in a Redis Hash (`projects:data`).
    2.  **User Access:** We fetch the `Portal_Us_X_Job_Ticke` junction module to map Users to Deals efficiently. This creates a list of allowed IDs for each user (`user:{email}:projects`).

---

## 2. Real-Time Sync (Deals Webhook)

When a Deal is created or edited, we push the changes to the app immediately.

### A. Create Workflow Rule
1.  Go to **Setup > Automation > Workflow Rules**.
2.  Click **+ Create Rule**.
3.  **Module:** `Deals`.
4.  **Rule Name:** "Sync Deal to Field App".
5.  **When:** Create OR Edit.

### B. Deluge Script (`sync_deal_to_app`)
Associate this function with the workflow:

```javascript
/* 
 * Function: sync_deal_to_app
 * Trigger: Workflow Rule on Deals
 */

// 1. Get Deal Details
deal = zoho.crm.getRecordById("Deals", dealId);

// 2. Prepare Payload
payload = Map();
payload.put("id", deal.get("id"));
payload.put("Deal_Name", deal.get("Deal_Name"));
payload.put("Stage", deal.get("Stage"));

// Custom Fields (Colors, Specs)
payload.put("Supplier_Color", deal.get("Supplier_Color"));
payload.put("Trim_Coil_Color", deal.get("Trim_Coil_Color"));
payload.put("Shingle_Accessory_Color", deal.get("Shingle_Accessory_Color"));
payload.put("Gutter_Types", deal.get("Gutter_Types"));
payload.put("Siding_Style", deal.get("Siding_Style"));

// Handle Account Name (Lookup)
accountName = "";
acc = deal.get("Account_Name");
if (acc != null) {
    accountName = acc.get("name");
}
payload.put("Account_Name", accountName);

// 3. Call Webhook
url = "https://roofworx-time-entry-app.vercel.app/api/webhooks/projects";

headers = Map();
headers.put("x-roofworx-secret", "YOUR_WEBHOOK_SECRET"); // Match env ZOHO_WEBHOOK_SECRET

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

## 3. Scheduled Sync (Reconciliation)

We need a periodic job to sync the **User Permissions** (the connection between Users and Deals). This processes the `Portal_Us_X_Job_Ticke` module.

### A. Vercel Cron (Automatic)
The app is configured to run this automatically every day at 00:00 UTC.
-   Endpoint: `/api/cron/sync-projects`

### B. Zoho Schedule (Manual/Frequent)
If you want to control the schedule from Zoho (e.g., run every 2 hours):

1.  Go to **Setup > Automation > Schedules**.
2.  Click **Create Schedule**.
3.  **Name:** `Trigger Field App Sync`.
4.  **Frequency:** Daily / Hourly.
5.  **Action:** Custom Function.

### C. Deluge Script (`trigger_app_sync`)
Paste this into the Schedule function:

```javascript
/*
 * Function: trigger_app_sync
 * Trigger: Scheduled
 */

// Your App URL
url = "https://roofworx-time-entry-app.vercel.app/api/cron/sync-projects";

// Call the Next.js API (GET Request)
response = invokeurl
[
    url: url
    type: GET
];

info "Sync Triggered: " + response;
```

---

## 4. Verification

1.  **Check Redis:**
    -   Key `projects:data`: Should contain JSON for all deals.
    -   Key `user:{email}:projects`: Should contain a set of Deal IDs.
2.  **Check App:**
    -   Log in as a user.
    -   Ensure you only see projects connected to you in the `Portal_Us_X_Job_Ticke` module.
