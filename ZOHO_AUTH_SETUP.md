# Zoho CRM Auth Integration Guide

This guide explains how to configure Zoho CRM to automatically provision users in the Roof Worx Field App when they are activated.

## Prerequisite
- You must have the `CRON_SECRET` from your `.env.local` ready.
- You must know your deployed app URL (e.g., `https://roofworx-app.vercel.app`).

## Step 1: Create a Workflow Rule

1.  Go to **Setup > Automation > Workflow Rules**.
2.  Click **+ Create Rule**.
3.  **Module**: Select the module where your field users are stored (e.g., `Contacts` or a custom `Field_Users` module).
4.  **Rule Name**: "Provision Field App User".
5.  **When**: "Create" or "Field Update" (e.g., when a "Field App Access" checkbox is checked).

## Step 2: Write the Deluge Script

1.  Under **Actions**, click **Function**.
2.  Select **Write your own**.
3.  Name: `provision_field_user`.
4.  Click **Edit Arguments** and map `contactId` to the record ID.
5.  Paste the following script:

```javascript
// 1. Generate Random Password
// Characters to use
chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
password = "";
// Generate 12 char password
for i in {1..12}
{
	r = floor(random() * chars.length());
	password = password + chars.subString(r, r+1);
}

// 2. Get User Details
contact = zoho.crm.getRecordById("Contacts", contactId);
email = contact.get("Email");
name = contact.get("First_Name") + " " + contact.get("Last_Name");

// 3. Call Next.js Webhook
url = "https://YOUR_APP_URL/api/auth/provision";
headers = Map();
headers.put("Authorization", "Bearer YOUR_CRON_SECRET");
headers.put("Content-Type", "application/json");

payload = Map();
payload.put("email", email);
payload.put("tempPassword", password);
payload.put("zohoId", contactId);
payload.put("name", name);

response = invokeurl
[
	url: url
	type: POST
	parameters: payload.toString()
	headers: headers
];

info response;

// 4. Send Email (Optional - if not handled by next.js)
// You can use Zoho's Send Email action in the workflow, storing the password in a temp field first, 
// OR send it via the deluge script using sendmail.

sendmail
[
	from: zoho.adminuserid
	to: email
	subject: "Welcome to Roof Worx Field App"
	message: "Hello " + name + ",<br><br>Your account has been created.<br><br>Login: " + email + "<br>Temporary Password: " + password + "<br><br>Please login at https://YOUR_APP_URL and update your password immediately."
]
```

6.  **Save** and **Associate** the function.

## Step 3: Test

1.  Create a new Contact in Zoho with an email address.
2.  Trigger the workflow (e.g., check the box).
3.  Check the "Timeline" in Zoho to see if the function executed successfully.
4.  Check your email for the temporary password.
5.  Try logging in to the Field App.

