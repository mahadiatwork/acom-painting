# Troubleshooting & Lessons Learned

This document captures the specific challenges encountered during the implementation of the Roof Worx Field App, particularly the Zoho CRM integration and Supabase Auth flow. Use this as a reference for future projects to avoid similar pitfalls.

## 1. Environment Variable Confusion (`CRON_SECRET` vs `ZOHO_WEBHOOK_SECRET`)

**The Issue:**
We initially used `CRON_SECRET` in the code (`process.env.CRON_SECRET`) but instructed the setup of `ZOHO_WEBHOOK_SECRET` in the documentation and Vercel. This led to `401 Unauthorized` errors because the code was checking against an undefined variable.

**The Fix:**
-   Ensure the code variable matches the Vercel environment variable exactly.
-   **Lesson:** Standardize naming early. If a secret is used for a webhook, `WEBHOOK_SECRET` is better than `CRON_SECRET` to avoid ambiguity.

## 2. Zoho Connection Types (OAuth vs Custom Service)

**The Issue:**
We used the existing `portal_conn` (a "Zoho OAuth" connection) to call our Next.js app.
-   **Zoho OAuth** connections inject `Authorization: Zoho-oauthtoken ...` intended for Zoho APIs.
-   Our Next.js app expected `Authorization: Bearer <OUR_SECRET>`.
-   Result: `401 Unauthorized`.

**The Fix:**
-   Created a **Custom Service** connection (`roofworx_app_conn`) with `Authentication Type: API Key`.
-   Configured it to inject `Authorization: Bearer <SECRET>` into the header.
-   **Lesson:** "Zoho OAuth" connections are for Zoho calling Zoho. "Custom Service" connections are for Zoho calling external apps.

## 3. Zoho Deluge Payload Formatting

**The Issue:**
We encountered `400 Bad Request` ("Missing required fields") because the Next.js API wasn't receiving the JSON body correctly.
-   Using `parameters: payload.toString()` in `invokeurl` often sends data as `application/x-www-form-urlencoded` or a stringified key-value pair, not raw JSON.

**The Fix:**
-   Explicitly set the header: `headers.put("Content-Type", "application/json")`.
-   Passed the JSON string as the `parameters` argument (which acts as the body when the content-type is JSON).
-   **Lesson:** Always explicit set `Content-Type: application/json` when sending JSON from Deluge.

## 4. Supabase Service Role Key

**The Issue:**
We encountered `500 Internal Server Error` on the provisioning route.
-   The server-side admin client (`createAdminClient`) requires the `SUPABASE_SERVICE_ROLE_KEY` to bypass Row Level Security (RLS) and create users.
-   This key was missing from Vercel environment variables.

**The Fix:**
-   Added `SUPABASE_SERVICE_ROLE_KEY` to Vercel (obtained from Supabase > Project Settings > API).
-   **Lesson:** Client-side uses `ANON_KEY`. Server-side admin tasks (user creation) use `SERVICE_ROLE_KEY`. Never expose the Service Role Key to the client.

## 5. Vercel Cron Job Limits

**The Issue:**
Deployment failed with "Hobby accounts are limited to daily cron jobs".
-   We had configured a cron job to run hourly (`0 * * * *`).

**The Fix:**
-   Changed schedule to daily (`0 0 * * *`).
-   **Lesson:** Check platform limits (Vercel Hobby Tier) before defining cron schedules.

## 6. Next.js Build Time Errors

**The Issue:**
1.  **Unescaped JSX**: Apostrophes in text (e.g., `We'll`) caused build failures. Fixed by using `&apos;`.
2.  **Database Connection**: The build failed because `DATABASE_URL` was missing in the local/build environment, and the `db.ts` file initialized the connection at the top level.

**The Fix:**
-   Added fallback logic in `db.ts`: `process.env.DATABASE_URL || "postgres://..."` to allow the build to proceed (even if the connection isn't usable).
-   **Lesson:** Ensure top-level code in library files handles missing environment variables gracefully during the build phase.

## 7. Layout & Redirects

**The Issue:**
-   The "Update Password" page showed the bottom navigation bar (intended for logged-in users).
-   After updating the password, users weren't forced to re-login.

**The Fix:**
-   Updated `Layout.tsx` to conditionally hide `BottomNav` for `/update-password`.
-   Added `supabase.auth.signOut()` and redirected to `/login` after password update.
-   **Lesson:** explicit layout control per route is often necessary. Password changes should always invalidate the current session for security.


