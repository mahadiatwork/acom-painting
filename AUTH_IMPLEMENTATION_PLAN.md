# Authentication Implementation Plan: Zoho-Driven Provisioning

This plan outlines the steps to implement an authentication flow where users are managed in Zoho CRM, provisioned via a webhook to Next.js/Supabase, and authenticated in the app.

## Phase 1: Supabase & Project Setup
- [ ] **Install Supabase SSR**: Install `@supabase/ssr` and `@supabase/supabase-js` for robust auth handling in Next.js.
- [ ] **Env Variables**: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (required for admin user creation).
- [ ] **Supabase Clients**:
    - Create `src/lib/supabase/server.ts` (for Server Components/Actions).
    - Create `src/lib/supabase/client.ts` (for Client Components).
    - Create `src/lib/supabase/admin.ts` (for the provisioning API).

## Phase 2: Provisioning API (Webhook)
- [ ] **Create Route**: `src/app/api/auth/provision/route.ts`.
- [ ] **Logic**:
    - Validate a shared secret (e.g., `CRON_SECRET`) to ensure the request comes from Zoho.
    - Receive payload: `{ email, tempPassword, zohoId, name }`.
    - Use `supabaseAdmin.auth.admin.createUser()` to create the user.
    - Set `user_metadata`: `{ force_password_change: true, zoho_id: zohoId, name: name }`.
    - Handle cases where the user already exists (update or ignore).

## Phase 3: Frontend Authentication Flow
- [ ] **Login Page (`src/app/(auth)/login/page.tsx`)**:
    - Wire up the form to `supabase.auth.signInWithPassword`.
    - Handle errors (invalid login).
    - On success, check `session.user.user_metadata.force_password_change`.
    - If `true`, redirect to `/update-password`.
    - If `false`, redirect to `/` (Dashboard).
- [ ] **Update Password Page (`src/app/(auth)/update-password/page.tsx`)**:
    - Allow user to enter a new password.
    - Call `supabase.auth.updateUser({ password: newPassword, data: { force_password_change: false } })`.
    - On success, redirect to Dashboard.
- [ ] **Middleware (`src/middleware.ts`)**:
    - Protect dashboard routes (`/`, `/projects`, etc.).
    - Redirect unauthenticated users to `/login`.
    - Redirect authenticated users with `force_password_change` to `/update-password`.

## Phase 4: Zoho CRM Configuration (Documentation)
- [ ] **Deluge Script Guide**: Create a documentation file (`ZOHO_AUTH_SETUP.md`) with the Deluge script snippet.
    - Script will: Generate a random string, call the Next.js webhook, and (optionally) send the email template.

## Phase 5: Cleanup & Integration
- [ ] Update the existing `Layout.tsx` header to show the real user name from Supabase Auth.
- [ ] Update `src/lib/schema.ts` if we need to link the `users` table to Supabase IDs (optional, since metadata handles the mapping).

