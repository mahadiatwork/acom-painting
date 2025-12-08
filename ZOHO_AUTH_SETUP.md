# Zoho CRM Auth Integration Guide

This guide explains how to configure Zoho CRM to automatically provision users in the Roof Worx Field App when they are activated.

## Prerequisite
- You must have the `ZOHO_WEBHOOK_SECRET` (generated previously, e.g., `xK9mPq2Lw5Nr8Yz4Jv3Ab7Dc6Ef1Gh0T`).
- You must know your deployed app URL (e.g., `https://roofworx-app.vercel.app`).

## Step 1: Create Zoho Connection

Using a Connection secures your secret key and simplifies the script.

1.  Go to **Setup > Developer Space > Connections**.
2.  Click **Create Connection**.
3.  Choose **Custom Service**.
    - **Service Name**: `RoofWorx App`
    - **Authentication Type**: `API Key`
    - **Parameter Name**: `Authorization`
    - **Value**: `Bearer xK9mPq2Lw5Nr8Yz4Jv3Ab7Dc6Ef1Gh0T` (Replace with your actual secret)
    - **Add to**: `Header`
4.  **Connection Name**: `roofworx_app_conn` (Use this exact name).
5.  Click **Create/Save**.

## Step 2: Create a Workflow Rule

1.  Go to **Setup > Automation > Workflow Rules**.
2.  Click **+ Create Rule**.
3.  **Module**: Select the module where your field users are stored (e.g., `Contacts` or a custom `Field_Users` module).
4.  **Rule Name**: "Provision Field App User".
5.  **When**: "Create" or "Field Update" (e.g., when a "Field App Access" checkbox is checked).

## Step 3: Write the Deluge Script

1.  Under **Actions**, click **Function**.
2.  Select **Write your own**.
3.  Name: `provision_field_user`.
4.  Click **Edit Arguments** and map `recordId` to the record ID.
5.  Paste the following script:

```javascript
/* 
 * Function: provision_field_user
 * Trigger: Workflow Rule
 */

// 1. Generate Random Password
chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
password = "";
for i in {1..12}
{
	r = floor(random() * chars.length());
	password = password + chars.subString(r, r+1);
}

// 2. Get User Details
// Adjust "Contacts" to your specific module name if different
record = zoho.crm.getRecordById("Contacts", recordId);
email = record.get("Email");
name = record.get("First_Name") + " " + record.get("Last_Name");

// 3. Call Next.js Webhook using Connection
// The Connection handles the Authorization header automatically
url = "https://YOUR_APP_URL/api/auth/provision";

payload = Map();
payload.put("email", email);
payload.put("tempPassword", password);
payload.put("zohoId", recordId);
payload.put("name", name);

response = invokeurl
[
	url: url
	type: POST
	parameters: payload.toString()
	connection: "roofworx_app_conn"
];

info response;

// 4. Send Email
// Send the temporary credentials to the user
sendmail
[
	from: zoho.adminuserid
	to: email
	subject: "Welcome to Roof Worx Field App"
	message: "Hello " + name + ",<br><br>Your account has been created.<br><br>Login: " + email + "<br>Temporary Password: " + password + "<br><br>Please login at https://YOUR_APP_URL and update your password immediately."
]
```

6.  **Save** and **Associate** the function.

## Step 4: Test

1.  Create a new record in Zoho with an email address.
2.  Trigger the workflow.
3.  Check the "Timeline" in Zoho to see if the function executed successfully.
4.  Check your email for the temporary password.
5.  Try logging in to the Field App.
