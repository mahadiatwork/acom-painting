# Zoho CRM Projects Sync Setup

This guide explains how to configure Zoho CRM to push Deal updates to the Roof Worx Field App in real-time.

## Prerequisite
- You must have the `ZOHO_WEBHOOK_SECRET` (e.g., `xK9m...`).
- App URL: `https://your-app-url.vercel.app`.

## Step 1: Create Zoho Connection (If not exists)

Reuse the `roofworx_app_conn` connection created for User Provisioning.
If you haven't created it yet, see [ZOHO_AUTH_SETUP.md](ZOHO_AUTH_SETUP.md).

## Step 2: Create a Workflow Rule

1.  Go to **Setup > Automation > Workflow Rules**.
2.  Click **+ Create Rule**.
3.  **Module**: `Deals`.
4.  **Rule Name**: "Sync Deal to Field App".
5.  **When**: 
    -   **Create**: Check box.
    -   **Edit**: Check box. Select "Any Field" or specific fields like "Stage", "Deal Name".

## Step 3: Write the Deluge Script

1.  Under **Actions**, click **Function**.
2.  Select **Write your own**.
3.  Name: `sync_deal_to_app`.
4.  Click **Edit Arguments** and map `dealId` to the Deal ID.
5.  Paste the following script:

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
payload.put("Supplier_Color", deal.get("Supplier_Color"));
payload.put("Trim_Coil_Color", deal.get("Trim_Coil_Color"));
payload.put("Shingle_Accessory_Color", deal.get("Shingle_Accessory_Color"));
payload.put("Gutter_Types", deal.get("Gutter_Types"));
payload.put("Siding_Style", deal.get("Siding_Style"));
payload.put("Stage", deal.get("Stage"));

// Handle Account Name (Lookup field)
accountName = "";
acc = deal.get("Account_Name");
if (acc != null) {
    accountName = acc.get("name");
}
payload.put("Account_Name", accountName);

// 3. Call Webhook using Connection
url = "https://roofworx-time-entry-app.vercel.app//api/webhooks/projects";

// Add Header for Security
headers = Map();
// If using Connection with API Key type, this might be auto-injected.
// If using Connection with "None" or manual handling:
// headers.put("x-roofworx-secret", "YOUR_SECRET_KEY"); 

// Note: Our App expects 'x-roofworx-secret'. 
// If your connection injects 'Authorization', you might need to update the API route 
// OR simply pass the secret in a custom header here manually.

// RECOMMENDED: Pass manually for this specific webhook header
headers.put("x-roofworx-secret", "xK9mPq2Lw5Nr8Yz4Jv3Ab7Dc6Ef1Gh0T"); 

response = invokeurl
[
	url: url
	type: POST
	parameters: payload.toString()
    headers: headers
    content-type: "application/json"
    // connection: "roofworx_app_conn" // Optional if you just want to whitelist the domain
];

info response;
```

6.  **Save** and **Associate**.

## Step 4: Verification

1.  Create a Deal in Zoho.
2.  Check the "Timeline" for success.
3.  Check the Field App (refresh Redis if needed, or wait for cache to update).

