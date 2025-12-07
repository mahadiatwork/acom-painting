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

## 4. Zoho CRM (Optional)

Zoho remains the destination for exported entries if you still want to push data there later.

1.  Go to the [Zoho API Console](https://api-console.zoho.com/).
2.  Create a server-based client and copy `Client ID`/`Client Secret`.
3.  Generate a refresh token by following Zoho's OAuth flow.
4.  Store them in `.env.local`.

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
    *   `sync-projects`: Runs hourly to refresh Redis.
    *   `sync-entries`: Runs every 5 mins to push pending entries to Zoho.

## Verification

-   **Projects**: Check if the "Select Job" dropdown populates. If empty, check Redis connection or Zoho Sync logs.
-   **Entries**: Submit an entry. It should appear in the Supabase `time_entries` table immediately. You can fetch them via `/api/time-entries` or extend the sync to Zoho if desired.

