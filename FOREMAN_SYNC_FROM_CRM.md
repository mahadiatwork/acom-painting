# Foreman Sync from Zoho CRM (No Individual Passwords)

This document describes how foremen are added and synced from Zoho CRM to Supabase so they appear in the app’s **Select Foreman** list. Authentication is **shared** (one login from Zoho org variables); foremen do not get individual passwords or Supabase Auth accounts.

---

## Zoho CRM modules (three separate)

| Module | Purpose |
|--------|--------|
| **Portal Users / Users** | Separate module; works as before (e.g. who can access the portal). Not used for the foremen list. |
| **Foreman** | Separate module. When a foreman is **created** in the CRM, a **Zoho workflow** calls the app webhook and the foreman is **pushed to Supabase** (`foremen` table). There is **no cron sync** for foremen – only the workflow → webhook. |
| **Painters** | Crew members; synced to Supabase `painters` table by cron for the crew dropdown on timesheets. |

---

## Overview

| Before | Now |
|--------|-----|
| Each foreman got a Supabase Auth user + random password; welcome email with credentials | No per-foreman accounts. One shared login (org variables). Foremen are **records** in the **Foreman** module and in Postgres `foremen` (name, email, phone). |
| Provision webhook created Auth user + wrote to Postgres | Webhook syncs **foreman data** from the **Foreman** module to the **foremen** table. No password, no email with credentials. |

**Flow:**

1. In Zoho CRM you create (or edit) a **Foreman** record (Name, Email, Phone) in the **Foreman** module.
2. A **Zoho workflow** runs on that create/edit and calls **POST /api/webhooks/foremen** with the foreman data.
3. The webhook upserts one row in the Supabase **foremen** table. There is **no cron sync** for foremen – only this workflow → webhook.
4. The app’s **Select Foreman** list is loaded from the **foremen** table; users log in with the **shared** credentials and then choose a foreman.

---

## Database (Supabase)

Foremen are stored in a dedicated **foremen** table (not in `users`). Users are added separately.

**foremen** table:

- `id` – UUID (Supabase), used as X-Selected-Foreman-Id and in `time_entries.foreman_id`
- `zoho_id` – Foreman module record ID from Zoho (unique)
- `name` – full name from CRM
- `email` – from CRM
- `phone` – phone/mobile from CRM
- `created_at`, `updated_at`

**time_entries** has `foreman_id` (references `foremen.id`) for who owns the timesheet.

Run the migration once:

```sql
-- Run in Supabase SQL Editor (see CREATE_FOREMEN_TABLE.sql)
CREATE TABLE IF NOT EXISTS foremen (
  id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_id     VARCHAR NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  created_at  TEXT DEFAULT now(),
  updated_at  TEXT DEFAULT now()
);
CREATE INDEX IF NOT EXISTS foremen_zoho_id_idx ON foremen (zoho_id);
CREATE INDEX IF NOT EXISTS foremen_email_idx ON foremen (email);

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS foreman_id TEXT;
ALTER TABLE time_entries ALTER COLUMN user_id DROP NOT NULL;
```

(See `CREATE_FOREMEN_TABLE.sql` in the repo.)

---

## API

- **POST /api/webhooks/foremen**  
  Called by Zoho when a Portal User (foreman) is created or updated.  
  - **Auth:** `Authorization: Bearer <ZOHO_WEBHOOK_SECRET>`  
  - **Body:** `{ "id": "<foreman_record_id>", "Email": "<email>", "name": "<full name>", "phone": "<phone>" }`  
  - **Behavior:** Upserts into the **foremen** table by `zoho_id`. No `users` table or Supabase Auth.

- **GET /api/foremen**  
  Returns the list of foremen from the **foremen** table. Used by the Select Foreman screen. Includes `id`, `email`, `name`, `phone`.

---

## Zoho CRM Setup

1. **Foreman module**  
   Ensure it has (or equivalent):
   - **Name**
   - **Email**
   - **Phone** (or **Mobile**)

2. **Organization variable**  
   Store your webhook secret in an org variable, e.g. `ZOHO_WEBHOOK_SECRET`, and use it in Deluge as below.

3. **Workflow**  
   On **Create** (and optionally **Edit**) of a **Foreman** record, run the Deluge function below. This is the **only** way foremen get into Supabase – there is no cron sync for foremen.

4. **Optional – project assignments (cron)**  
   The cron does **not** sync foremen; it only syncs projects and (optionally) foreman–project assignments. If you have a junction module linking Foremen to Jobs/Deals, the cron reads existing foremen from the `foremen` table (those pushed by the webhook) and syncs project access. Set:
   - `ZOHO_JUNCTION_MODULE_NAME` – API name of the junction (e.g. `Foreman_X_Jobs`).
   - `ZOHO_JUNCTION_FOREMAN_LOOKUP_FIELD` – lookup field for the foreman side (e.g. `Foreman`; default is `Contractors`).

---

## Environment variables (app)

Foremen are **not** synced by the cron; they are only pushed via the webhook. The cron uses the **foremen** table (webhook-pushed) only to build foreman ID → email for project assignments.

| Variable | Description |
|----------|-------------|
| `ZOHO_JUNCTION_MODULE_NAME` | Junction module linking foremen to projects (e.g. `Foreman_X_Jobs`). Used by cron for project assignments only. |
| `ZOHO_JUNCTION_FOREMAN_LOOKUP_FIELD` | Lookup field in the junction for the foreman side: `Foreman` or `Contractors`. Default: `Contractors`. |

---

## Zoho Deluge: Sync Foreman record to Supabase (Foreman module)

Use this when the source of foremen is the **Foreman** module (not Portal_Users). It pushes **name, email, phone** to your app.

```deluge
void automation.sync_foreman_to_supabase(Int recordId)
{
    // 1. Get Foreman record from the Foreman module (API name often "Foremen" or "Foreman")
    record = zoho.crm.getRecordById("Foremen", recordId);  // or "Foreman" – match your module API name
    email = ifnull(record.get("Email"), "").trim();
    if (email == "")
    {
        return; // No email - skip
    }

    name = ifnull(record.get("Name"), "").trim();
    if (name == "")
    {
        name = email; // Fallback to email for display
    }

    // Phone: try Phone first, then Mobile
    phone = "";
    if (record.get("Phone") != null && record.get("Phone") != "")
    {
        phone = record.get("Phone").toString().trim();
    }
    else if (record.get("Mobile") != null && record.get("Mobile") != "")
    {
        phone = record.get("Mobile").toString().trim();
    }

    // 2. Call webhook to upsert foreman in Supabase foremen table (no Auth user, no password)
    url = "https://acom-painting.vercel.app/api/webhooks/foremen";
    secret = zoho.crm.getOrgVariable("ZOHO_WEBHOOK_SECRET");

    // Build JSON body (escape quotes in name/phone for valid JSON)
    nameEsc  = name.replaceAll("\"", "\\\\\"");
    phoneEsc = phone.replaceAll("\"", "\\\\\"");
    jsonBody = "{\"id\":\"" + recordId.toString() + "\",\"Email\":\"" + email.replaceAll("\"", "\\\\\"") + "\",\"name\":\"" + nameEsc + "\",\"phone\":\"" + phoneEsc + "\"}";

    headers = Map();
    headers.put("Authorization", "Bearer " + secret);
    headers.put("Content-Type", "application/json");

    response = invokeurl
    [
        url     : url
        type    : POST
        body    : jsonBody
        headers : headers
    ];

    info response;
}
```

**Notes:**

- Replace `https://acom-painting.vercel.app` with your app URL if different.
- The webhook expects **Bearer** auth: `Authorization: Bearer <ZOHO_WEBHOOK_SECRET>`.
- No random password is generated and no welcome email is sent. Foremen use the **shared portal login** (org variables) and then select their name on the app.

---

## Optional: Welcome Email (No Credentials)

If you still want to notify new foremen that they’ve been added (without sending any password), you can add a second function or extend the same one:

```deluge
// Optional: notify foreman they were added (no login credentials)
sendmail
[
    from    : zoho.loginuserid
    to      : email
    subject : "Welcome to ACOM Painting Field App"
    message : "Hello " + name + ",<br><br>You have been added as a foreman. Use the shared portal login and select your name when logging time.<br><br>App: <a href='https://acom-painting.vercel.app'>https://acom-painting.vercel.app</a><br><br>Thanks,<br>ACOM Painting Team"
];
```

---

## Summary

- **Zoho:** Add/edit Portal Users with Name, Email, Phone. Trigger the Deluge function above on create/edit.
- **Webhook:** `POST /api/webhooks/foremen` with Bearer secret and body `{ id, Email, name, phone }` → upserts into Supabase **foremen** table; no `users` table or Supabase Auth.
- **App:** Foremen list comes from `GET /api/foremen` (from **foremen** table). Everyone signs in with the **shared** credentials, then chooses a foreman by **name** (and email/phone if you show them).

No individual foreman passwords are created or sent.

