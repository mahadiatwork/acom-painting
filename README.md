# ACOM Painting - Time Entry App

A Next.js field application for ACOM Painting crews to log time entries and sundry materials, integrated with Zoho CRM and Supabase.

**Live URL:** [https://acom-painting.vercel.app](https://acom-painting.vercel.app)

---

## Architecture Overview

```
┌─────────────┐         ┌────────────────────┐         ┌──────────────┐
│  Zoho CRM   │────────>│  Next.js (Vercel)   │────────>│   Supabase   │
│ (Source of   │ Webhook │  API Routes         │ Drizzle │  PostgreSQL  │
│  Record)     │<────────│  + Background Sync  │<────────│  (App Source │
└─────────────┘  Zoho   └────────────────────┘  ORM     │   of Truth)  │
                  API           │                        └──────────────┘
                                │                               │
                                v                               │
                        ┌────────────────┐                      │
                        │   Frontend     │<─────────────────────┘
                        │   (React 19)   │   Supabase Auth + API
                        └────────────────┘
```

### Key Design Principles

- **Single Source of Truth (Data):** Project data originates in Zoho CRM.
- **Single Source of Truth (App):** The frontend ONLY reads from Supabase. It never queries Zoho directly.
- **No Redis:** Direct Zoho -> Supabase -> Postgres flow. Redis was removed from this project.
- **Write-Behind for Time Entries:** Time entries are saved to Postgres immediately (blocking), then synced to Zoho CRM in the background using Vercel's `waitUntil` so users don't wait.

### Tech Stack

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Framework      | Next.js 15 (App Router)                              |
| UI             | Tailwind CSS 4, Shadcn UI, Radix Primitives          |
| Database       | PostgreSQL (Supabase) via Drizzle ORM                |
| Auth           | Supabase Auth (single shared login from Zoho CRM org variables) |
| Data Fetching  | React Query (TanStack Query v5)                      |
| Validation     | Zod                                                  |
| HTTP Client    | Axios (Zoho API), Fetch (internal APIs)              |
| Deployment     | Vercel                                               |
| External CRM   | Zoho CRM (Deals, Portal Users, Time Entries modules) |

---

## Data Synchronization

### Projects (Zoho -> Supabase)

One-way sync with two mechanisms:

1. **Trigger Sync (Real-time):** A Zoho Workflow Rule fires when a Deal reaches "Project Accepted" status, calling `POST /api/sync/projects/trigger`. The project is upserted into Postgres using `zoho_record_id` as the unique key.

2. **Safety Net Sync (Daily):** A scheduled Zoho Deluge function iterates all active deals and calls `POST /api/sync/projects/daily` for each. This ensures no data is missed.

3. **Full Cron Sync:** `GET /api/cron/sync-projects` performs a bulk sync of all deals, portal users, and user-project assignments from Zoho.

### Time Entries (App -> Supabase -> Zoho)

1. User submits a time entry in the app.
2. Entry is written to Postgres **immediately** (blocking) -- user sees instant confirmation.
3. Background sync to Zoho CRM runs via `waitUntil` (non-blocking).
4. On each new submission, a **piggyback recovery** mechanism retries any previously failed Zoho syncs for that user.
5. Entries have a `synced` flag to track Zoho sync status.

### Users & Authentication (Zoho -> Supabase)

- **Shared portal login:** One Supabase Auth user is used for all foremen. Its email and password come from Zoho CRM **organization variables**: `portal_user_email` (Email type) and `portal_user_login` (Single Line, used as password). After login, users choose which foreman they are logging time for via **Select Foreman**; the foremen list comes from the Postgres **foremen** table; foremen are pushed only when a Zoho workflow runs on Foreman create (POST /api/webhooks/foremen). There is no cron sync for foremen.
- **Syncing credentials:** Call `GET /api/auth/sync-portal-credentials` (or the cron `GET /api/cron/sync-portal-credentials`) with `Authorization: Bearer ZOHO_WEBHOOK_SECRET` to create or update the single Supabase Auth user from the current Zoho variable values. Schedule this (e.g. daily) or run it after changing the variables in Zoho.
- **Provision webhook:** `POST /api/auth/provision` is a no-op (returns success) so existing Zoho workflows do not break; no per-foreman Supabase Auth users are created.

---

## Database Schema

Managed with Drizzle ORM. Schema defined in `src/lib/schema.ts`.

### Tables

| Table                | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `foremen`            | Foremen synced from Zoho Portal_Users (name, email, phone, `zoho_id`) |
| `users`              | App users (added separately; not used for foreman list)          |
| `time_entries`       | Timesheet parent (job, date, `foreman_id`, notes, sundries, `synced`) |
| `timesheet_painters` | Junction: painter + start/end/lunch/total hours per timesheet    |
| `painters`           | Crew members synced from Zoho Painters module                    |
| `projects`           | Projects synced from Zoho (id, name, status, date, address)       |
| `user_projects`      | Junction table for user-project assignments                      |

### Sundry Items (14 tracked materials)

Each time entry stores quantities for: Masking Paper Roll, Plastic Roll, Putty/Spackle Tub, Caulk Tube, White Tape Roll, Orange Tape Roll, Floor Paper Roll, Tip, Sanding Sponge, 18" Roller Cover, 9" Roller Cover, Mini Cover, Masks, Brick Tape Roll.

---

## API Routes

### Authentication & Users

| Route                              | Method | Description                                                                 |
| ---------------------------------- | ------ | --------------------------------------------------------------------------- |
| `/api/auth/provision`              | POST   | Zoho webhook (no-op); shared login uses org variables, not per-user provision |
| `/api/auth/sync-portal-credentials`| GET    | Sync shared Supabase Auth user from Zoho variables (portal_user_email, portal_user_login); secured by ZOHO_WEBHOOK_SECRET |
| `/api/user/zoho-id`                | GET    | Get logged-in user's Zoho ID from `users` table                             |

### Time Entries (Timesheets)

| Route                        | Method | Description                                                       |
| ---------------------------- | ------ | ----------------------------------------------------------------- |
| `/api/time-entries`          | GET    | Fetch foreman's timesheets with nested painters (date filtering)  |
| `/api/time-entries`          | POST   | Create timesheet (job, date, painters[]; Postgres then Zoho sync) |

### Projects

| Route                        | Method | Description                                      |
| ---------------------------- | ------ | ------------------------------------------------ |
| `/api/projects`              | GET    | Fetch all "Project Accepted" projects            |

### Sync Endpoints (called by Zoho Deluge)

| Route                            | Method | Description                                  |
| -------------------------------- | ------ | -------------------------------------------- |
| `/api/sync/projects/trigger`     | POST   | Real-time project sync (Zoho workflow)       |
| `/api/sync/projects/daily`       | POST   | Daily safety net project sync                |
| `/api/cron/sync-projects`        | GET    | Full cron: projects + assignments (foremen are webhook-only, not synced here) |
| `/api/cron/sync-portal-credentials` | GET | Cron: sync shared portal login from Zoho org variables (ZOHO_WEBHOOK_SECRET) |

### Webhooks (called by Zoho)

| Route                            | Method | Description                                  |
| -------------------------------- | ------ | -------------------------------------------- |
| `/api/webhooks/projects`         | POST   | Zoho project update notifications            |
| `/api/webhooks/foremen`          | POST   | Zoho Portal User (foreman) create/update → sync to `foremen` table |
| `/api/webhooks/users`            | POST   | (Legacy) Zoho user update notifications     |
| `/api/webhooks/assignments`      | POST   | Zoho foreman-project assignment changes     |
| `/api/webhooks/painters`         | POST   | Zoho Painter create/update                   |

### Painters (Foreman model)

| Route                            | Method | Description                                  |
| -------------------------------- | ------ | -------------------------------------------- |
| `/api/painters`                  | GET    | List active painters for crew dropdown       |
| `/api/webhooks/painters`         | POST   | Zoho webhook for Painter create/update       |

---

## UI Pages

| Path                 | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `/login`             | Login (Supabase Auth)                                  |
| `/forgot-password`   | Password reset request                                 |
| `/update-password`   | Password update (first login or reset)                 |
| `/`                  | Dashboard: weekly hours, recent entries                |
| `/entry/new`         | New time entry (with Sundry Items tab)                 |
| `/entry/[id]`        | Entry detail view (time, sundry items, sync status)    |
| `/history`           | Time history with 7/30 day filter                      |
| `/projects`          | Project list (all "Project Accepted" deals)            |
| `/profile`           | User profile                                           |
| `/notices`           | Notices                                                |

---

## Environment Variables

### Required

| Variable                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`                  | Supabase Connection Pooling URL (port **6543**)    |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key (for admin operations)   |
| `ZOHO_WEBHOOK_SECRET`           | Shared secret for webhook authentication           |

### Zoho API (at least one auth method required)

| Variable                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `ZOHO_ACCESS_TOKEN_URL`         | URL to fetch Zoho access token (preferred method)  |
| `ZOHO_CLIENT_ID`                | Zoho OAuth client ID (alternative method)          |
| `ZOHO_CLIENT_SECRET`            | Zoho OAuth client secret                           |
| `ZOHO_REFRESH_TOKEN`            | Zoho OAuth refresh token                           |
| `ZOHO_API_DOMAIN`               | Zoho API domain (default: `https://www.zohoapis.com`) |

### Optional

| Variable                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `DATABASE_URL_DIRECT`           | Direct Supabase connection (port 5432, for Drizzle migrations) |
| `ZOHO_JUNCTION_MODULE_NAME`     | Zoho junction module name (default: `Portal_Us_X_Job_Ticke`) |
| `ZOHO_JUNCTION_FOREMAN_LOOKUP_FIELD` | Lookup field in junction for foreman side: `Contractors` or `Foreman` (default: `Contractors`) |
| `ZOHO_FOREMAN_MODULE_NAME`      | Zoho Foreman module API name for foremen list (default: `Foremen`) |
| `ZOHO_PAINTERS_MODULE_NAME`     | Zoho Painters module API name (default: `Painters`) |

**Zoho CRM Variables (shared portal login):** Ensure org variables `portal_user_email` and `portal_user_login` exist in Zoho CRM. The Zoho OAuth token must have scope **ZohoCRM.settings.variables.READ** to read them.

> **Important:** On Vercel, `DATABASE_URL` **must** use the Supabase Connection Pooling URL (port 6543), not the direct connection (port 5432). See [VERCEL_DATABASE_FIX.md](VERCEL_DATABASE_FIX.md).

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (package manager)

### Setup

1. Clone the repository.
2. Copy `.env.example` to `.env.local` and fill in the required environment variables.
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Run the development server:
   ```bash
   pnpm dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

### Database Migrations

Push Drizzle schema changes to Postgres:
```bash
pnpm db:push
```

Open Drizzle Studio to browse data:
```bash
pnpm db:studio
```

SQL migration files are available in the project root for manual execution in Supabase SQL Editor:
- `CREATE_FOREMEN_TABLE.sql` - Create `foremen` table and add `foreman_id` to `time_entries`
- `ADD_SYNCED_COLUMN_AND_SUNDRY_ITEMS.sql` - Add synced flag + sundry item columns
- `CREATE_PROJECTS_TABLE_MINIMAL.sql` - Create the projects table

---

## Documentation

### Setup & Configuration

- [Zoho Auth Setup](ZOHO_AUTH_SETUP.md) - User provisioning from Zoho CRM to Supabase
- [Foreman Sync from CRM](FOREMAN_SYNC_FROM_CRM.md) - Sync foremen (name, email, phone) from Zoho Portal Users; no individual passwords; includes Deluge code
- [Zoho Sync Deluge Scripts](ZOHO_SYNC_DELUGE_SCRIPTS.md) - Trigger & daily sync Deluge code
- [Zoho Projects Sync](ZOHO_PROJECTS_SYNC.md) - Real-time sync webhooks configuration
- [Database Setup](DATABASE_SETUP.md) - Database configuration guide

### Implementation Plans

- [Architecture Plan](ARCHITECTURE_PLAN.md) - High-level architectural decisions
- [Auth Implementation Plan](AUTH_IMPLEMENTATION_PLAN.md) - Authentication flow details
- [Time Entries Implementation](TIME_ENTRIES_IMPLEMENTATION.md) - Optimistic UI + background sync
- [Zoho Time Entries Plan](ZOHO_TIME_ENTRIES_IMPLEMENTATION_PLAN.md) - Zoho time entry API integration
- [Minimal Projects Implementation](MINIMAL_PROJECTS_IMPLEMENTATION.md) - Simplified projects schema

### Troubleshooting

- [Troubleshooting & Lessons](TROUBLESHOOTING_AND_LESSONS.md) - Common issues and fixes
- [Vercel Database Fix](VERCEL_DATABASE_FIX.md) - Connection pooling URL fix for Vercel
- [Postgres Connection Troubleshooting](POSTGRES_CONNECTION_TROUBLESHOOTING.md) - Database connection issues
- [Database Connection Fix](DATABASE_CONNECTION_FIX.md) - Connection string encoding
- [Time Entries Troubleshooting](TIME_ENTRIES_TROUBLESHOOTING.md) - Time entry sync issues
- [Zoho Lookup Fields Fix](ZOHO_LOOKUP_FIELDS_FIX.md) - Portal_User / Job field format fix
- [Test Zoho Sync](TEST_ZOHO_SYNC.md) - Testing Zoho CRM integration

### Reference

- [Zoho CRM Integration Guide](ZOHO_CRM_INTEGRATION_GUIDE.md) - Zoho API interactions
- [Setup Guide](SETUP_GUIDE.md) - Full local setup instructions
- [Next.js Migration Guide](NEXTJS_MIGRATION_GUIDE.md) - Migration from React/Vite
- [Architecture Implementation](ARCHITECTURE_IMPLEMENTATION.md) - Implementation details

---

## Key Scripts

| Script           | Command            | Description                            |
| ---------------- | ------------------ | -------------------------------------- |
| `dev`            | `pnpm dev`         | Start development server               |
| `build`          | `pnpm build`       | Production build                       |
| `start`          | `pnpm start`       | Start production server                |
| `lint`           | `pnpm lint`        | Run ESLint                             |
| `check`          | `pnpm check`       | Run TypeScript type checking           |
| `db:push`        | `pnpm db:push`     | Push Drizzle schema to Postgres        |
| `db:studio`      | `pnpm db:studio`   | Open Drizzle Studio                    |

---

## Foreman-Based Migration Plan

> **Status:** IMPLEMENTED. Run `FOREMAN_MIGRATION_PHASE1.sql` in Supabase SQL Editor and create the Painters + Time_Entries_X_Painters modules in Zoho CRM before using the new timesheet flow.

### 1. Business Context & Motivation

We are migrating from an **individual painter** time-entry model to a **Foreman-based crew timesheet** model.

| Aspect | Old Model (Current) | New Model (Target) |
| --- | --- | --- |
| Who logs in | Every painter | Only the Foreman |
| What they create | One time entry = one painter's hours | One daily timesheet = one job, one date, **multiple** painters |
| Granularity | Per-painter start/end/lunch | Per-painter start/end/lunch, but rolled up under a single timesheet |
| Sundry items | Per time entry (effectively per painter) | Per **timesheet** (shared across all painters on that sheet) |
| Notes | Per time entry | Per **timesheet** |

### 2. Zoho CRM Data Model (Target)

The Zoho CRM modules after migration:

```
┌─────────────────┐       ┌────────────────────────────┐       ┌──────────────┐
│  Portal_Users   │       │       Time_Entries          │       │   Painters   │
│  (= Foremen)    │       │  (Parent Timesheet)         │       │  (NEW module)│
│                 │       │                            │       │              │
│  id             │──┐    │  id                        │    ┌──│  id          │
│  Email          │  │    │  Job (Lookup → Deals)      │    │  │  Name        │
│  Full_Name      │  └───>│  Portal_User (Lookup)      │    │  │  Email       │
│                 │       │  Date                      │    │  │  Phone       │
└─────────────────┘       │  Time_Entry_Note           │    │  │  Active      │
                          │  Sundry fields (x14)       │    │  └──────────────┘
                          │                            │    │
                          │  (NO Start/End/Lunch/Total)│    │
                          └─────────────┬──────────────┘    │
                                        │                   │
                                        │ 1:N               │
                                        ▼                   │
                          ┌─────────────────────────────┐   │
                          │ Time_Entries_X_Painters      │   │
                          │ (NEW junction module)        │   │
                          │                             │   │
                          │ Time_Entry (Lookup)    ─────┘   │
                          │ Painter    (Lookup)    ─────────┘
                          │ Start_Time  (DateTime)      │
                          │ End_Time    (DateTime)      │
                          │ Lunch_Start (DateTime)      │
                          │ Lunch_End   (DateTime)      │
                          │ Total_Hours (Number)        │
                          └─────────────────────────────┘
```

**Key changes in Zoho:**
- `Time_Entries` loses its individual time fields (`Start_Time`, `End_Time`, `Lunch_Start`, `Lunch_End`, `Total_Hours`). It becomes a **header** record.
- `Painters` is a brand-new custom module holding crew member records.
- `Time_Entries_X_Painters` is a brand-new junction module. Each record links one `Time_Entry` to one `Painter` and stores that painter's specific time-in/out data.

### 3. Database Schema Changes (Supabase / Postgres)

#### 3.1 NEW TABLE: `painters`

Synced one-way from the Zoho `Painters` module. The Zoho record ID is used as the primary key (same pattern as `projects`).

```sql
CREATE TABLE painters (
  id          VARCHAR PRIMARY KEY,          -- Zoho Painter record ID
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TEXT    DEFAULT now(),
  updated_at  TEXT    DEFAULT now()
);

CREATE INDEX painters_name_idx   ON painters (name);
CREATE INDEX painters_active_idx ON painters (active);
```

Drizzle definition (`src/lib/schema.ts`):

```typescript
export const painters = pgTable("painters", {
  id:        varchar("id").primaryKey(),             // Zoho record ID
  name:      text("name").notNull(),
  email:     text("email"),
  phone:     text("phone"),
  active:    boolean("active").notNull().default(true),
  createdAt: text("created_at").default(sql`now()`),
  updatedAt: text("updated_at").default(sql`now()`),
}, (table) => ({
  nameIdx:   index("painters_name_idx").on(table.name),
  activeIdx: index("painters_active_idx").on(table.active),
}));
```

#### 3.2 MODIFY TABLE: `time_entries` (becomes the Timesheet parent)

**Columns to ADD:**

| Column | Type | Purpose |
| --- | --- | --- |
| `zoho_time_entry_id` | `VARCHAR NULL` | Stores the Zoho `Time_Entries` record ID returned after background sync. Required so junction records can reference the parent. |
| `total_crew_hours` | `TEXT DEFAULT '0'` | Denormalized sum of all painters' hours for quick display on dashboards/history. |

**Columns to DROP** (moved to the junction table):

| Column | Reason |
| --- | --- |
| `start_time` | Per-painter, now lives in `timesheet_painters` |
| `end_time` | Per-painter, now lives in `timesheet_painters` |
| `lunch_start` | Per-painter, now lives in `timesheet_painters` |
| `lunch_end` | Per-painter, now lives in `timesheet_painters` |
| `total_hours` | Per-painter, now lives in `timesheet_painters` |

**Columns that STAY unchanged:**

`id`, `user_id` (Foreman's Supabase Auth ID), `job_id`, `job_name`, `date`, `notes`, `change_order`, `synced`, `created_at`, and all 14 sundry-item columns.

> **Migration safety:** During development, keep the old columns in the database but mark them as deprecated in the Drizzle schema. Drop them only after the new flow is fully deployed and verified.

SQL migration:

```sql
-- Step 1: Add new columns
ALTER TABLE time_entries ADD COLUMN zoho_time_entry_id VARCHAR;
ALTER TABLE time_entries ADD COLUMN total_crew_hours TEXT DEFAULT '0';

-- Step 2: (DEFERRED -- run only after verifying the new flow in production)
-- ALTER TABLE time_entries DROP COLUMN start_time;
-- ALTER TABLE time_entries DROP COLUMN end_time;
-- ALTER TABLE time_entries DROP COLUMN lunch_start;
-- ALTER TABLE time_entries DROP COLUMN lunch_end;
-- ALTER TABLE time_entries DROP COLUMN total_hours;
```

#### 3.3 NEW TABLE: `timesheet_painters` (Junction)

Mirrors the Zoho `Time_Entries_X_Painters` junction module. Links a timesheet to a painter with that painter's specific time data.

```sql
CREATE TABLE timesheet_painters (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id     VARCHAR NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  painter_id       VARCHAR NOT NULL,               -- FK to painters.id (Zoho Painter ID)
  painter_name     TEXT    NOT NULL,                -- Denormalized for display
  start_time       TEXT    NOT NULL,
  end_time         TEXT    NOT NULL,
  lunch_start      TEXT    NOT NULL DEFAULT '',
  lunch_end        TEXT    NOT NULL DEFAULT '',
  total_hours      TEXT    NOT NULL,
  zoho_junction_id VARCHAR,                         -- Zoho Time_Entries_X_Painters record ID (set after sync)
  created_at       TEXT    DEFAULT now(),

  UNIQUE (timesheet_id, painter_id)                 -- One row per painter per timesheet
);

CREATE INDEX tp_timesheet_id_idx ON timesheet_painters (timesheet_id);
CREATE INDEX tp_painter_id_idx   ON timesheet_painters (painter_id);
```

Drizzle definition:

```typescript
export const timesheetPainters = pgTable("timesheet_painters", {
  id:              varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timesheetId:     varchar("timesheet_id").notNull(),  // FK -> time_entries.id
  painterId:       varchar("painter_id").notNull(),     // FK -> painters.id
  painterName:     text("painter_name").notNull(),
  startTime:       text("start_time").notNull(),
  endTime:         text("end_time").notNull(),
  lunchStart:      text("lunch_start").notNull().default(''),
  lunchEnd:        text("lunch_end").notNull().default(''),
  totalHours:      text("total_hours").notNull(),
  zohoJunctionId:  varchar("zoho_junction_id"),
  createdAt:       text("created_at").default(sql`now()`),
}, (table) => ({
  timesheetIdx:    index("tp_timesheet_id_idx").on(table.timesheetId),
  painterIdx:      index("tp_painter_id_idx").on(table.painterId),
  uniquePainter:   unique("tp_timesheet_painter_unique").on(table.timesheetId, table.painterId),
}));
```

#### 3.4 Schema Summary (Post-Migration)

```
┌──────────┐    ┌──────────────────┐    ┌──────────────────────┐    ┌──────────┐
│  users   │    │  time_entries     │    │ timesheet_painters    │    │ painters │
│ (Foremen)│    │  (Timesheet)      │    │ (Junction)            │    │ (Crew)   │
│──────────│    │──────────────────│    │──────────────────────│    │──────────│
│ id (PK)  │◄──│ user_id (FK)     │    │ timesheet_id (FK) ───│───►│ id (PK)  │
│ email    │    │ id (PK)          │◄───│ id (PK)              │    │ name     │
│ zoho_id  │    │ job_id           │    │ painter_id (FK)  ────│───►│ email    │
│ ...      │    │ job_name         │    │ painter_name         │    │ phone    │
└──────────┘    │ date             │    │ start_time           │    │ active   │
                │ notes            │    │ end_time             │    └──────────┘
  ┌──────────┐  │ synced           │    │ lunch_start          │
  │ projects │  │ zoho_time_entry_id│   │ lunch_end            │
  │──────────│  │ total_crew_hours │    │ total_hours          │
  │ id (PK)  │◄─│ sundry cols (x14)│    │ zoho_junction_id     │
  │ name     │  └──────────────────┘    └──────────────────────┘
  │ status   │
  │ ...      │
  └──────────┘
```

### 4. API Route Changes

#### 4.1 NEW: `GET /api/painters`

Returns all active painters for the frontend dropdown.

```
Response: [{ id, name, email, phone }]
```

Source: `SELECT * FROM painters WHERE active = true ORDER BY name`

#### 4.2 NEW: `POST /api/webhooks/painters`

Webhook endpoint called by Zoho when a Painter record is created or updated.

```
Auth:    Bearer ZOHO_WEBHOOK_SECRET
Payload: { id, Name, Email, Phone, Active }
Action:  UPSERT into painters table using id as the unique key
```

#### 4.3 MODIFY: `GET /api/cron/sync-projects`

Add a **Step 3** to the existing cron job: after syncing projects and users, also bulk-sync painters from the Zoho `Painters` module.

```
New Step: GET /crm/v2/Painters?fields=id,Name,Email,Phone,Active
          → batch UPSERT into painters table
```

#### 4.4 MODIFY: `POST /api/time-entries` (Complete Rewrite)

**New request payload shape:**

```json
{
  "jobId": "6838013000000977057",
  "jobName": "Smith Residence",
  "date": "2026-02-16",
  "notes": "Exterior trim completed",
  "sundryItems": [
    { "sundryItem": "Masking Paper Roll", "quantity": 3 },
    { "sundryItem": "Caulk Tube", "quantity": 2 }
  ],
  "painters": [
    {
      "painterId": "6838013000001234001",
      "painterName": "John Doe",
      "startTime": "07:00",
      "endTime": "15:30",
      "lunchStart": "12:00",
      "lunchEnd": "12:30"
    },
    {
      "painterId": "6838013000001234002",
      "painterName": "Jane Smith",
      "startTime": "08:00",
      "endTime": "16:00",
      "lunchStart": "12:00",
      "lunchEnd": "12:30"
    }
  ]
}
```

**Blocking path (immediate):**

1. Validate payload with Zod (including `painters` array, min length 1).
2. Generate a UUID for the timesheet (`time_entries.id`).
3. Calculate `total_crew_hours` = sum of each painter's hours.
4. **Database transaction:**
   - `INSERT INTO time_entries` (parent: job, date, foreman, notes, sundries, `synced: false`).
   - `INSERT INTO timesheet_painters` (one row per painter with their times).
5. Return `201` with the full timesheet object immediately.

**Background path (`waitUntil`):**

```
Step 1:  Create parent Time_Entries record in Zoho
         Payload: { Job: {id}, Portal_User: {id}, Date, Time_Entry_Note, Sundry fields }
         Response: zohoTimeEntryId
         → UPDATE time_entries SET zoho_time_entry_id = :zohoTimeEntryId

Step 2:  For EACH painter in the timesheet:
           Create Time_Entries_X_Painters junction record in Zoho
           Payload: { Time_Entry: {id: zohoTimeEntryId}, Painter: {id: painterId},
                      Start_Time, End_Time, Lunch_Start, Lunch_End, Total_Hours }
           Response: zohoJunctionId
           → UPDATE timesheet_painters SET zoho_junction_id = :zohoJunctionId

Step 3:  If parent + ALL junction records succeed:
           UPDATE time_entries SET synced = true

Step 4:  Piggyback recovery (retry unsynced timesheets for this foreman)
```

**Error & partial-failure handling:**

| Scenario | Behavior |
| --- | --- |
| Zoho parent creation fails | `synced` stays `false`. Retry on next submission. |
| Parent succeeds, some painters fail | `zoho_time_entry_id` is set; failed painters have `zoho_junction_id = NULL`. Retry targets only NULL junction rows. |
| Parent succeeds, all painters succeed | `synced = true`. |

#### 4.5 MODIFY: `GET /api/time-entries`

Returns timesheets with nested painter data.

**Query strategy:** Fetch from `time_entries` (filtered by `user_id` + date range), then batch-fetch related `timesheet_painters` rows. Merge in application code.

**New response shape:**

```json
[
  {
    "id": "uuid",
    "jobId": "...",
    "jobName": "Smith Residence",
    "date": "2026-02-16",
    "notes": "...",
    "synced": true,
    "totalCrewHours": 15.5,
    "sundryItems": { "maskingPaperRoll": "3", "caulkTube": "2", ... },
    "painters": [
      { "id": "...", "painterId": "...", "painterName": "John Doe", "startTime": "07:00", "endTime": "15:30", "lunchStart": "12:00", "lunchEnd": "12:30", "totalHours": "8.0" },
      { "id": "...", "painterId": "...", "painterName": "Jane Smith", "startTime": "08:00", "endTime": "16:00", "lunchStart": "12:00", "lunchEnd": "12:30", "totalHours": "7.5" }
    ]
  }
]
```

### 5. Zoho Client Changes (`src/lib/zoho.ts`)

#### 5.1 NEW METHOD: `getPainters()`

```typescript
async getPainters(): Promise<ZohoPainter[]>
// GET /crm/v2/Painters?fields=id,Name,Email,Phone,Active
```

#### 5.2 MODIFY METHOD: `createTimeEntry()`

Remove individual time fields. The method now only creates the **parent** record.

**Current signature fields to REMOVE:** `startTime`, `endTime`, `lunchStart`, `lunchEnd`, `totalHours`

**New signature:**

```typescript
async createTimeEntry(data: {
  projectId: string;       // Deal ID → Job lookup
  foremanId: string;       // Portal User ID → Portal_User lookup
  date: string;            // YYYY-MM-DD
  notes?: string;          // Time_Entry_Note
  sundryItems?: Record<string, number>;
}): Promise<{ id: string }>  // Returns the Zoho record ID
```

#### 5.3 NEW METHOD: `createTimesheetPainterEntry()`

Creates a single record in the `Time_Entries_X_Painters` junction module.

```typescript
async createTimesheetPainterEntry(data: {
  zohoTimeEntryId: string;  // Parent Time_Entries record ID
  painterId: string;        // Painter record ID
  date: string;             // YYYY-MM-DD
  startTime: string;        // HH:MM
  endTime: string;          // HH:MM
  lunchStart?: string;
  lunchEnd?: string;
  totalHours: string;
  timezone: string;
}): Promise<{ id: string }>  // Returns the Zoho junction record ID
// POST /crm/v2/Time_Entries_X_Painters
```

### 6. Sync Logic Changes (`src/lib/sync-utils.ts`)

#### 6.1 New Interface: `TimesheetData`

Replaces the current flat `TimeEntryData` interface.

```typescript
interface TimesheetData {
  id: string;
  userId: string;           // Foreman's Supabase Auth ID
  jobId: string;
  jobName: string;
  date: string;
  notes?: string;
  changeOrder?: string;
  synced: boolean;
  zohoTimeEntryId?: string; // Set after Zoho parent creation
  totalCrewHours: string;
  // Sundry items (same 14 fields)
  maskingPaperRoll?: string;
  // ... (all 14)
  // Nested painters
  painters: TimesheetPainterData[];
}

interface TimesheetPainterData {
  id: string;               // timesheet_painters.id
  painterId: string;        // painters.id (Zoho Painter ID)
  painterName: string;
  startTime: string;
  endTime: string;
  lunchStart: string;
  lunchEnd: string;
  totalHours: string;
  zohoJunctionId?: string;  // Set after Zoho junction creation
}
```

#### 6.2 Rewrite: `syncTimesheetToZoho()`

Replaces `syncToPermanentStorage()`. Orchestrates the two-phase Zoho sync:

```
Phase 1: Create parent (if zohoTimeEntryId is NULL)
  → zohoClient.createTimeEntry({ projectId, foremanId, date, notes, sundryItems })
  → Store returned ID in time_entries.zoho_time_entry_id

Phase 2: Create junction records (for each painter where zohoJunctionId is NULL)
  → zohoClient.createTimesheetPainterEntry({ zohoTimeEntryId, painterId, times... })
  → Store returned ID in timesheet_painters.zoho_junction_id

Phase 3: If all succeeded → UPDATE time_entries SET synced = true
```

#### 6.3 Rewrite: `retryFailedSyncs()`

Query logic changes:

```sql
-- Find timesheets that need sync (parent or any child incomplete)
SELECT te.* FROM time_entries te
WHERE te.user_id = :userId
  AND te.synced = false;

-- For each, also fetch its painters
SELECT tp.* FROM timesheet_painters tp
WHERE tp.timesheet_id = :timesheetId;
```

Retry logic:
- If `zoho_time_entry_id IS NULL` → retry Phase 1 first, then Phase 2.
- If `zoho_time_entry_id IS NOT NULL` but some `zoho_junction_id IS NULL` → retry only Phase 2 for the missing painters.

### 7. UI/UX Changes

#### 7.1 `/entry/new` -- Complete Redesign

**Layout: Three sections (scrollable form):**

```
┌──────────────────────────────────────┐
│  ← New Timesheet                     │  (Header)
├──────────────────────────────────────┤
│  ┌─ Job Details ──────────────────┐  │
│  │  Job:  [Dropdown ▼]           │  │
│  │  Date: [2026-02-16]           │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ Crew ─────────────────────────┐  │
│  │                                │  │
│  │  ┌─ Painter 1 ──────────────┐ │  │
│  │  │ [John Doe ▼]             │ │  │
│  │  │ Start: [07:00] End: [15:30]│ │  │
│  │  │ Lunch: [12:00] - [12:30] │ │  │
│  │  │ Hours: 8.0    [🗑 Remove]│ │  │
│  │  └──────────────────────────┘ │  │
│  │                                │  │
│  │  ┌─ Painter 2 ──────────────┐ │  │
│  │  │ [Jane Smith ▼]           │ │  │
│  │  │ Start: [08:00] End: [16:00]│ │  │
│  │  │ Lunch: [12:00] - [12:30] │ │  │
│  │  │ Hours: 7.5    [🗑 Remove]│ │  │
│  │  └──────────────────────────┘ │  │
│  │                                │  │
│  │  [ + Add Painter ]            │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ Tabs: [Sundry Items] [Notes] ─┐ │
│  │  (same sundry UI as today)      │ │
│  └─────────────────────────────────┘ │
│                                      │
│  [ Cancel ]  [ Submit Timesheet ]    │
└──────────────────────────────────────┘
```

**State management:**

```typescript
// Parent state (same as today, minus individual time fields)
const [jobId, setJobId] = useState("");
const [date, setDate]   = useState(todayStr);
const [notes, setNotes] = useState("");
const [sundryItems, setSundryItems] = useState<SundryItem[]>([]);

// Painters array (NEW -- dynamic list)
const [painters, setPainters] = useState<PainterEntry[]>([
  { painterId: "", painterName: "", startTime: "", endTime: "", lunchStart: "", lunchEnd: "" }
]);

// Add/remove painter handlers
const addPainter    = () => setPainters(prev => [...prev, emptyPainterRow()]);
const removePainter = (index: number) => setPainters(prev => prev.filter((_, i) => i !== index));
```

**Validation rules:**
- At least 1 painter required.
- Each painter must have a selected `painterId`, `startTime`, and `endTime`.
- Same painter cannot appear twice on one timesheet.

#### 7.2 `/entry/[id]` -- Updated Detail View

Replace the single-painter time display with a **crew table**:

```
┌─ Smith Residence ──── SYNCED ────────┐
│  Date: 2026-02-16                    │
│  Total Crew Hours: 15.5             │
├──────────────────────────────────────┤
│  ┌─ Crew Details ─────────────────┐  │
│  │ John Doe    07:00-15:30  8.0h │  │
│  │ Jane Smith  08:00-16:00  7.5h │  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│  Sundry Items: (same as today)      │
│  Notes: Exterior trim completed     │
└──────────────────────────────────────┘
```

#### 7.3 `/history` -- Updated Cards

Each card now represents a **timesheet**, not an individual entry:

```
┌────────────────────────────────────┐
│  Smith Residence           SYNCED  │
│  📅 2026-02-16                     │
│  👷 2 painters  ·  ⏱ 15.5 hrs     │
└────────────────────────────────────┘
```

#### 7.4 Dashboard `/` -- Updated Metrics

- **"Hours This Week"** → now shows total **crew hours** submitted by this Foreman for the current week.
- **"Recent Entries"** → shows recent timesheets with painter count and total crew hours.

#### 7.5 NEW: `GET /api/painters` Hook

New React Query hook:

```typescript
// src/hooks/usePainters.ts
export function usePainters() {
  return useQuery({
    queryKey: ['painters'],
    queryFn: () => fetch('/api/painters').then(r => r.json()),
    staleTime: 5 * 60 * 1000, // Painters don't change often; 5 min cache
  });
}
```

### 8. Authentication Changes

No structural changes. The existing provisioning flow already maps `Portal_Users` (Zoho) to Supabase Auth accounts. The semantic shift is:

| Current | After Migration |
| --- | --- |
| `users.zoho_id` = any Portal User (painter) | `users.zoho_id` = Foreman's Portal User ID |
| Every painter gets a Supabase Auth account | Only Foremen get Supabase Auth accounts |
| `Portal_User` lookup on Time Entry = the painter | `Portal_User` lookup on Time Entry = the Foreman who submitted |

**Action items:**
- Update the Zoho Deluge provisioning script to only fire for Foreman-role Portal Users (filter by a role/tag field in Zoho).
- Update login page label from "Email" placeholder to clarify it's Foreman-only access.
- No changes needed to `/api/auth/provision` route logic itself.

### 9. Files to Change (Impact Summary)

| File | Action | Scope |
| --- | --- | --- |
| `src/lib/schema.ts` | **MODIFY** | Add `painters` table, add `timesheetPainters` table, add `zohoTimeEntryId` + `totalCrewHours` to `timeEntries`, deprecate time columns |
| `src/lib/zoho.ts` | **MODIFY** | Add `getPainters()`, add `createTimesheetPainterEntry()`, rewrite `createTimeEntry()` to parent-only |
| `src/lib/sync-utils.ts` | **REWRITE** | Replace flat sync with two-phase relational sync, update retry logic |
| `src/app/api/time-entries/route.ts` | **REWRITE** | New payload schema, transaction insert (parent + painters), new GET response shape |
| `src/app/api/painters/route.ts` | **NEW** | `GET` endpoint returning active painters |
| `src/app/api/webhooks/painters/route.ts` | **NEW** | Zoho webhook for painter CRUD |
| `src/app/api/cron/sync-projects/route.ts` | **MODIFY** | Add painter sync step |
| `src/hooks/usePainters.ts` | **NEW** | React Query hook for painters |
| `src/hooks/useTimeEntries.ts` | **MODIFY** | Update `TimeEntry` interface to include `painters[]` and `totalCrewHours` |
| `src/app/(main)/entry/new/page.tsx` | **REWRITE** | Dynamic multi-painter form |
| `src/app/(main)/entry/[id]/page.tsx` | **REWRITE** | Crew detail view |
| `src/app/(main)/history/page.tsx` | **MODIFY** | Show timesheet cards with painter count |
| `src/app/(main)/page.tsx` | **MODIFY** | Dashboard metrics use crew hours |

### 10. Implementation Order

The migration should be executed in this sequence to avoid breaking the live application:

```
Phase 1: Foundation (Database + Zoho Setup)
├── Step 1.1  Create Painters module in Zoho CRM
├── Step 1.2  Create Time_Entries_X_Painters junction module in Zoho CRM
├── Step 1.3  Run SQL migration: create painters table
├── Step 1.4  Run SQL migration: create timesheet_painters table
├── Step 1.5  Run SQL migration: add zoho_time_entry_id + total_crew_hours to time_entries
└── Step 1.6  Update Drizzle schema (src/lib/schema.ts)

Phase 2: Data Pipeline (Sync + API)
├── Step 2.1  Add getPainters() to src/lib/zoho.ts
├── Step 2.2  Create GET /api/painters route
├── Step 2.3  Create POST /api/webhooks/painters route
├── Step 2.4  Add painter sync to cron job
├── Step 2.5  Seed initial painters via cron sync
├── Step 2.6  Add createTimesheetPainterEntry() to zoho.ts
├── Step 2.7  Rewrite createTimeEntry() to parent-only
├── Step 2.8  Rewrite src/lib/sync-utils.ts (two-phase sync)
└── Step 2.9  Rewrite POST /api/time-entries (new payload + transaction)

Phase 3: Read Path (API + Hooks)
├── Step 3.1  Rewrite GET /api/time-entries (joined response)
├── Step 3.2  Create usePainters hook
└── Step 3.3  Update useTimeEntries hook (new interface)

Phase 4: UI
├── Step 4.1  Rewrite /entry/new (multi-painter form)
├── Step 4.2  Rewrite /entry/[id] (crew detail view)
├── Step 4.3  Update /history (timesheet cards)
├── Step 4.4  Update / dashboard (crew hours metric)
└── Step 4.5  Update login page labels

Phase 5: Cleanup
├── Step 5.1  Delete /entry/test_new (old test page)
├── Step 5.2  Delete /api/test/zoho-sync (old test route)
├── Step 5.3  Drop deprecated columns from time_entries (start_time, end_time, etc.)
└── Step 5.4  Update all documentation (.md files)
```

### 11. Zoho Configuration Checklist

These are manual steps to be performed in the Zoho CRM admin panel:

- [ ] Create `Painters` custom module with fields: `Name`, `Email`, `Phone`, `Active`
- [ ] Create `Time_Entries_X_Painters` junction module with fields: `Time_Entry` (lookup), `Painter` (lookup), `Start_Time` (DateTime), `End_Time` (DateTime), `Lunch_Start` (DateTime), `Lunch_End` (DateTime), `Total_Hours` (Number)
- [ ] Remove (or hide) `Start_Time`, `End_Time`, `Lunch_Start`, `Lunch_End`, `Total_Hours` fields from `Time_Entries` module layout
- [ ] Create a Zoho Workflow Rule on `Painters` module: on create/edit → call `POST /api/webhooks/painters`
- [ ] Update existing Deluge provisioning script to only fire for Foreman-role Portal Users
- [ ] Add sample Painter records for testing
- [ ] Create Zoho Org Variable for `Time_Entries_X_Painters` junction module API name (in case it gets auto-shortened)

### 12. Risk Assessment & Rollback

| Risk | Mitigation |
| --- | --- |
| Zoho junction module API name gets auto-shortened | Store actual API name in env var `ZOHO_TE_PAINTERS_MODULE_NAME` |
| Background sync timeout (many painters per sheet) | Limit to 20 painters per timesheet; use sequential API calls with error tracking per painter |
| Partial sync failure leaves orphaned Zoho records | Retry logic targets only missing junction records; parent ID is stored immediately |
| Breaking the live app during migration | Phase 1-2 are additive (new tables, new routes). Rewrite of `/entry/new` is a single deploy. Old time entries in the database remain readable. |
| Vercel `waitUntil` timeout (10s on Hobby, 60s on Pro) | For timesheets with >10 painters, consider batching Zoho API calls or using Zoho's batch insert endpoint (`/crm/v2/Time_Entries_X_Painters` with array payload) |
