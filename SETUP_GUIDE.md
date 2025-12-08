# Roof Worx Field App - Setup Guide

This guide walks you through setting up the external services required for the "Read-Aside, Write-Behind" architecture.

## 1. Database (PostgreSQL)

The application uses **PostgreSQL** with **Drizzle ORM**.

1.  Create a PostgreSQL database (recommended: [Neon](https://neon.tech) or [Supabase](https://supabase.com)).
2.  Get the connection string.
3.  Set `DATABASE_URL` in your `.env.local`.

## 2. Redis (Caching)

Used to cache the Project/Job list for fast dropdown loading.

1.  Sign up at [Upstash](https://upstash.com/).
2.  Create a new Redis database.
3.  Go to the database details and find the "REST API" section.
4.  Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5.  Add them to your `.env.local`.

## 3. Supabase (Project & Entry Storage)

We now use Postgres (Supabase/Neon) both for the job metadata and for buffering time entries.

1.  Create a Postgres database on [Supabase](https://supabase.com) or [Neon](https://neon.tech).
2.  Enable row-level security or keep it simple for development.
3.  Get the database URL (you can find it in the connection pool details).
4.  Set `DATABASE_URL` in `.env.local`.
5.  Obtain `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from API Settings.
6.  Obtain `SUPABASE_SERVICE_ROLE_KEY` for server-side user provisioning.

## 4. Zoho CRM (Authentication via Function)

We use a custom Zoho Function to retrieve access tokens securely, bypassing complex OAuth management in the app.

1.  **Create Zoho Connection**: Create a connection named `portal_conn` in Zoho CRM.
2.  **Create Standalone Function**: Create a standalone function (e.g., `Get_Access_Token`) with the following code:
    ```javascript
    /*
    *  Function: Get_Access_Token
    *  Connection: portal_conn
    */
    access_token_resp = invokeurl
    [
        url :"https://utility.v1.easy-pluginz.com/api/gettoken"
        type :GET
        connection:"portal_conn"
    ];
    response = Map();
    response.put("Content-Type","application/json");
    response.put("body",{"access_token":access_token_resp.get("accessToken")});
    return {"crmAPIResponse":response};
    ```
3.  **Publish as API**: Publish this function as a REST API to get the execution URL.
4.  **Configure Env**: Add the URL (including the `zapikey`) to your `.env.local`:
    ```
    ZOHO_ACCESS_TOKEN_URL=https://www.zohoapis.com/crm/v7/functions/get_access_token/actions/execute?auth_type=apikey&zapikey=YOUR_KEY
    ```

## 5. Running the App

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Run development server:
    ```bash
    npm run dev
    ```
3.  The app should be running at `http://localhost:3000`.

## 6. Deployment & Cron Jobs

To ensure data syncs automatically, you need to deploy to a platform that supports Cron jobs (like Vercel).

1.  **Push to GitHub**.
2.  **Import to Vercel**.
3.  Add all Environment Variables from `.env.local` to Vercel Project Settings.
4.  **Cron Jobs**:
    *   Vercel automatically detects `vercel.json` and sets up the cron jobs.
    *   `sync-projects`: Runs daily to refresh Redis.

## Verification

-   **Projects**: Check if the "Select Job" dropdown populates. If empty, check Redis connection or Zoho Sync logs.
-   **Entries**: Submit an entry. It should appear in the Supabase `time_entries` table immediately.
