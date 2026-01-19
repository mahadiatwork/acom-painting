# Zoho CRM Authentication Setup Guide

This guide explains how to configure Zoho CRM to automatically provision users in the Acom Painting Field App when they are activated.

## Architecture Overview

The authentication flow is: **Zoho CRM → Supabase Auth → Postgres Database**

1. **User Creation in Zoho CRM**: Admin creates/activates user in Zoho
2. **Zoho Webhook**: Calls `/api/auth/provision` with user details
3. **Supabase Auth**: Creates user in Supabase Auth with temporary password
4. **Postgres Database**: Stores user in `users` table with `zoho_id` mapping
5. **User Login**: User logs in via Supabase Auth, session managed by middleware
6. **Password Update**: First login redirects to `/update-password` if `force_password_change` is true

All data operations use Postgres as the single source of truth (no Redis caching).

## Prerequisites

- You must have the `ZOHO_WEBHOOK_SECRET` environment variable set in your Vercel deployment
- You must know your deployed app URL: `https://acom-painting.vercel.app`
- You must have `SUPABASE_SERVICE_ROLE_KEY` configured in your Vercel environment variables

## Step 1: Create Zoho Connection

Using a Connection secures your secret key and simplifies the script.

1. Go to **Setup > Developer Space > Connections** in Zoho CRM
2. Click **Create Connection**
3. Choose **Custom Service**
   - **Service Name**: `Acom Painting App`
   - **Authentication Type**: `API Key`
   - **Parameter Name**: `Authorization`
   - **Value**: `Bearer YOUR_ZOHO_WEBHOOK_SECRET` (Replace with your actual secret from Vercel)
   - **Add to**: `Header`
4. **Connection Name**: `acom_painting_app_conn` (Use this exact name)
5. Click **Create/Save**

## Step 2: Create a Workflow Rule

1. Go to **Setup > Automation > Workflow Rules** in Zoho CRM
2. Click **+ Create Rule**
3. **Module**: Select the module where your field users are stored (e.g., `Contacts` or a custom `Portal_Users` module)
4. **Rule Name**: "Provision Acom Painting Field App User"
5. **When**: Choose one of:
   - **Create**: Triggers when a new record is created
   - **Field Update**: Triggers when a specific field is updated (e.g., when a "Field App Access" checkbox is checked)

## Step 3: Write the Deluge Script

1. Under **Actions**, click **Function**
2. Select **Write your own**
3. **Name**: `provision_acom_painting_user`
4. Click **Edit Arguments** and map `recordId` to the record ID
5. Paste the following script:

```javascript
/* 
 * Function: provision_acom_painting_user
 * Trigger: Workflow Rule
 * Purpose: Automatically provision users in Acom Painting Field App
 */

// 1. Generate Random Password (12 characters)
chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
password = "";
for i in {1..12}
{
	r = floor(random() * chars.length());
	password = password + chars.subString(r, r+1);
}

// 2. Get User Details from Zoho CRM
// Adjust "Contacts" to your specific module name if different
// Common alternatives: "Portal_Users", "Field_Users", etc.
record = zoho.crm.getRecordById("Contacts", recordId);
email = record.get("Email");
firstName = record.get("First_Name");
lastName = record.get("Last_Name");
name = firstName + " " + lastName;

// Validate required fields
if (email == null || email == "")
{
	info "Error: Email is required for user provisioning";
	return;
}

// 3. Call Acom Painting App Webhook using Connection
// The Connection handles the Authorization header automatically
url = "https://acom-painting.vercel.app/api/auth/provision";

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
	connection: "acom_painting_app_conn"
];

// Log response for debugging
info "Provisioning Response: " + response;

// Check if provisioning was successful
if (response != null && response.contains("success"))
{
	info "User provisioned successfully: " + email;
	
	// 4. Send Welcome Email with Temporary Credentials
	sendmail
	[
		from: zoho.adminuserid
		to: email
		subject: "Welcome to Acom Painting Field App"
		message: "Hello " + name + ",<br><br>" +
		         "Your account has been created for the Acom Painting Field Time Entry App.<br><br>" +
		         "<strong>Login Credentials:</strong><br>" +
		         "Email: " + email + "<br>" +
		         "Temporary Password: " + password + "<br><br>" +
		         "<strong>Important:</strong> Please login at " + url.replace("/api/auth/provision", "") + 
		         " and update your password immediately for security.<br><br>" +
		         "If you have any questions, please contact your administrator."
	];
	
	info "Welcome email sent to: " + email;
}
else
{
	info "Error provisioning user: " + response;
	// Optionally send error notification to admin
}
```

6. **Save** and **Associate** the function with your workflow rule

## Step 4: Configure Environment Variables in Vercel

Make sure the following environment variables are set in your Vercel project:

1. Go to your Vercel project dashboard
2. Navigate to **Settings > Environment Variables**
3. Ensure these variables are set:
   - `ZOHO_WEBHOOK_SECRET` - The secret key you used in the Zoho Connection
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (for admin operations)
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `DATABASE_URL` - Your Postgres database connection string

## Step 5: Test the Integration

1. **Create a test user in Zoho CRM**:
   - Create a new record in your selected module (e.g., Contacts)
   - Ensure the record has:
     - A valid email address
     - First Name and Last Name fields populated
   - Save the record

2. **Trigger the workflow**:
   - If using "Create" trigger, the workflow should fire automatically
   - If using "Field Update" trigger, update the specified field

3. **Check the results**:
   - Check the "Timeline" in Zoho CRM to see if the function executed successfully
   - Check the user's email for the welcome message with temporary password
   - Try logging in to the Field App at your Vercel URL

4. **Verify in Supabase**:
   - Go to your Supabase dashboard
   - Navigate to **Authentication > Users**
   - Verify the user was created with the correct email
   - Check that `user_metadata` contains:
     - `force_password_change: true`
     - `zoho_id: <recordId>`
     - `name: <Full Name>`

5. **Test login flow**:
   - User should be able to login with temporary password
   - User should be redirected to `/update-password` on first login
   - After updating password, user should be able to access the dashboard

## Troubleshooting

### User not created in Supabase
- Check Vercel logs for errors in `/api/auth/provision`
- Verify `ZOHO_WEBHOOK_SECRET` matches in both Zoho Connection and Vercel
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check that the webhook URL is correct and accessible

### User created but can't login
- Verify user email is confirmed in Supabase (should be auto-confirmed)
- Check that password was set correctly
- Verify user exists in Postgres `users` table

### Workflow not triggering
- Verify workflow rule conditions are met
- Check workflow rule is active
- Verify function is associated with the workflow rule
- Check Zoho CRM logs for errors

### Email not received
- Check Zoho CRM email settings
- Verify email address is valid
- Check spam folder
- Verify Zoho has permission to send emails

## Security Notes

- The `ZOHO_WEBHOOK_SECRET` should be a strong, randomly generated string
- Never commit secrets to version control
- Use Vercel's environment variables for all sensitive configuration
- The temporary password is only sent via email - ensure email security
- Users are required to change their password on first login

## Next Steps

After authentication is set up:
1. Configure project sync via `/api/cron/sync-projects`
2. Set up user-project assignments via webhooks
3. Configure time entry sync to Zoho CRM
