# Roof Worx Field App

A Next.js application for field time entry, integrated with Zoho CRM and Supabase.

## Architecture

This app uses a "Read-Aside, Write-Behind" architecture:
-   **Frontend**: Next.js 15 (App Router), Tailwind CSS, Shadcn UI.
-   **Database**: PostgreSQL (Supabase/Neon) via Drizzle ORM.
-   **Caching**: Upstash Redis (caches Project/Job data).
-   **Authentication**: Supabase Auth (Provisioned via Zoho CRM).
-   **Backend Sync**:
    -   **Zoho -> App**: Webhook provisions users. Cron job syncs projects.
    -   **App -> Zoho**: Time entries are stored in Postgres (sync logic can be added later).

## Documentation

-   [**Setup Guide**](SETUP_GUIDE.md): How to run the app locally and set up services.
-   [**Migration Guide**](NEXTJS_MIGRATION_GUIDE.md): Details of the migration from React/Vite.
-   [**Architecture Plan**](ARCHITECTURE_PLAN.md): High-level architectural decisions.
-   [**Zoho Integration**](ZOHO_CRM_INTEGRATION_GUIDE.md): Deep dive into Zoho API interactions.
-   [**Zoho Auth Setup**](ZOHO_AUTH_SETUP.md): Step-by-step guide for User Provisioning.
-   [**Troubleshooting & Lessons**](TROUBLESHOOTING_AND_LESSONS.md): **READ THIS** if you encounter issues. Contains fixes for common deployment and integration problems.

## Getting Started

1.  Clone the repository.
2.  Copy `.env.example` to `.env.local` and fill in secrets.
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Run development server:
    ```bash
    npm run dev
    ```

## Key Scripts

-   `npm run db:push`: Push Drizzle schema changes to Postgres.
-   `npm run db:studio`: Open Drizzle Studio to view data.

