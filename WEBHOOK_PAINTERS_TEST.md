# Painters Webhook – Simple Test Guide

Use these steps to see exactly what is failing.

---

## Step 1: Test that the server receives your payload (echo, no DB)

### Option A: curl (from your machine)

Replace `https://acom-painting.vercel.app` with your app URL if different.

```bash
curl -X POST "https://acom-painting.vercel.app/api/webhooks/painters/test" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"test-123\",\"Name\":\"Test Painter\",\"Email\":\"t@t.com\",\"Phone\":\"\",\"Active\":true}"
```

**Expected:** HTTP 200 and JSON like:

```json
{
  "ok": true,
  "message": "Echo test – no database, no auth",
  "received": {
    "contentType": "application/json",
    "rawBodyLength": 75,
    "rawBodySample": "{\"id\":\"test-123\",\"Name\":\"Test Painter\",...}",
    "parsed": { "id": "test-123", "Name": "Test Painter", ... },
    "parseError": null,
    "hasAuth": false
  }
}
```

If you see this, the app is reachable and JSON is being received correctly.

### Option B: Zoho → echo URL (see what Zoho actually sends)

1. In your Deluge function, **temporarily** change the URL to:
   ```text
   url = "https://acom-painting.vercel.app/api/webhooks/painters/test";
   ```
2. Keep **`body : jsonBody`** (not `parameters`).
3. Run the workflow (create/edit a painter).
4. In the execution log, look at the **response** from the invokeurl call. You should see something like:
   ```json
   { "ok": true, "received": { "contentType": "...", "rawBodySample": "...", "parsed": { ... } } }
   ```
5. Check:
   - `received.contentType` should be `application/json`.
   - `received.parsed` should be your painter object with `id`, `Name`, etc.
   - If `received.parsed` is null and `parseError` is set, the body is not valid JSON.
   - If `rawBodySample` looks wrong (e.g. form data), Zoho is still sending the wrong format; keep using **`body : jsonBody`** and ensure you’re not using `parameters`.

When the echo response looks correct, the problem is not “what Zoho sends”. Then move to Step 2.

---

## Step 2: Test the real webhook (with auth and DB)

### 2a. Set the secret

In your app (Vercel), set:

```text
ZOHO_WEBHOOK_SECRET = some-long-secret-you-choose
```

In Zoho CRM: **Setup → Automation → Functions → Org Variables** (or equivalent), create a variable `ZOHO_WEBHOOK_SECRET` with the **same** value.

### 2b. Create the painters table in Supabase

In Supabase SQL Editor, run **one** of these:

- **Full migration:** `FOREMAN_MIGRATION_PHASE1.sql`
- **Only painters table:** `CREATE_PAINTERS_TABLE.sql`

Then in Supabase Table Editor, confirm the **`painters`** table exists.

### 2c. Call the real webhook with curl

Use the same secret you set above.

```bash
curl -X POST "https://acom-painting.vercel.app/api/webhooks/painters" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ZOHO_WEBHOOK_SECRET" \
  -d "{\"id\":\"curl-test-1\",\"Name\":\"Curl Test Painter\",\"Email\":\"\",\"Phone\":\"\",\"Active\":true}"
```

**Expected:** HTTP 200 and `{"success":true}`.

- If you get **401** → wrong or missing `ZOHO_WEBHOOK_SECRET`.
- If you get **500** → check Vercel logs for `[Webhook] Painters failed:` (e.g. missing `painters` table or DB error).
- If you get **400** → missing or invalid body (e.g. missing `id` or `Name`).

### 2d. Point Zoho back at the real URL

1. In Deluge, set the URL back to:
   ```text
   url = "https://acom-painting.vercel.app/api/webhooks/painters";
   ```
2. Ensure **`body : jsonBody`** and **Authorization: Bearer** + org variable for the secret.
3. Run the workflow again.

---

## Quick checklist

| Check | Action |
|-------|--------|
| Echo test 200 and `parsed` looks correct | Server receives valid JSON; if not, fix Zoho to use `body : jsonBody`. |
| Real webhook 401 | Fix `ZOHO_WEBHOOK_SECRET` (same in Vercel and Zoho). |
| Real webhook 500 | Run `CREATE_PAINTERS_TABLE.sql` in Supabase; check Vercel logs for the exact error. |
| Real webhook 400 | Ensure JSON has `id` and `Name` (and correct escaping in Deluge). |

---

## Test URL summary

| URL | Auth | DB | Use |
|-----|------|----|-----|
| `POST .../api/webhooks/painters/test` | No | No | See what the server receives (echo). |
| `POST .../api/webhooks/painters` | Bearer required | Yes | Real sync; needs `painters` table and correct secret. |
