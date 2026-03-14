## Work Performed & T&M Extra Work – Implementation Plan

> **Status:** PLANNED – UI and API payload scaffolding are in place. This document describes how to persist the new structures in Supabase and sync them to Zoho CRM without breaking the existing timesheet flow.

---

### 1. Scope & Goals

- **Work Performed**
  - Persist the new `WorkPerformedEntry` model (area, groupCode, taskCode, quantity, laborMinutes, dynamic measurements, paint/primer usage) in **Supabase**.
  - Sync Work Performed rows to **Zoho CRM** in a normalized, report-friendly way.
  - Preserve the rule that **paint and primer usage are per task entry**, not per day/job.
- **T&M Extra Work**
  - Persist structured **T&M extra work** (separate crew section, notes, total hours) alongside the main/customer timesheet in **Supabase**.
  - Sync T&M painters and totals to **Zoho CRM**, clearly separated from the main/customer work for reporting and billing.
  - Keep the existing **write-behind architecture**: app → Supabase (blocking), then Supabase → Zoho (background via `waitUntil`).

This plan assumes the current Foreman-based model described in `FOREMAN_MIGRATION_PHASE1.sql` and `TIME_ENTRIES_IMPLEMENTATION.md` is already in place.

---

### 2. Current State (as of this plan)

- **Frontend `/entry/new`**
  - Supports:
    - Work Performed selection with dynamic metadata (`WorkPerformedEntry`, `WorkPerformedMeasurements`).
    - A separate **T&M Extra Work** card with its own crew, hours, and notes.
  - Submits a payload to `POST /api/time-entries` with:
    - `workPerformed: WorkPerformedEntry[]`
    - `tmExtraWork?: { painters: PainterRow[]; notes: string; totalHours: number }`
    - Legacy `extraHours` and `extraWorkDescription`, currently derived from `tmTimeEntry`.
- **API (`src/app/api/time-entries/route.ts`)**
  - Zod schema for `workPerformed` and `tmExtraWork` is present, but:
    - **Work Performed is not yet written** to any Postgres table.
    - **T&M painters are not yet persisted**; only `extraHours` and `extraWorkDescription` are stored on `time_entries`.
  - Zoho sync (`syncTimesheetToZoho`) is unaware of work performed and T&M distinctions.
- **Database (Supabase / Drizzle)**
  - `time_entries`:
    - Holds main (customer) timesheet header + sundries, `extraHours`, `extraWorkDescription`.
    - Holds `total_crew_hours` but no normalized Work Performed data.
  - `timesheet_painters`:
    - Holds **customer** painters only (no way to distinguish T&M vs customer yet).
  - No dedicated `work_performed_entries` table exists yet.
  - Zoho CRM modules are aligned to the current Foreman plan but **do not yet store Work Performed rows or T&M-specific data**.

---

### 3. Supabase Data Model Changes

#### 3.1 New Table: `work_performed_entries`

**Purpose:** One row per `WorkPerformedEntry` in the UI; linked to a `time_entries` record.

**SQL draft (Supabase SQL editor):**

```sql
CREATE TABLE work_performed_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id      varchar NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,

  -- Normalized identifiers
  area              text    NOT NULL,          -- 'interior' | 'exterior'
  group_code        text    NOT NULL,
  group_label       text    NOT NULL,
  task_code         text    NOT NULL,
  task_label        text    NOT NULL,

  -- Core quantities
  quantity          numeric NOT NULL DEFAULT 0,  -- main production quantity
  labor_minutes     integer NOT NULL DEFAULT 0,
  paint_gallons     numeric NOT NULL DEFAULT 0,
  primer_gallons    numeric NOT NULL DEFAULT 0,
  primer_source     text    NOT NULL DEFAULT 'stock', -- 'stock' | 'retail'

  -- Optional dynamic measurements (flattened for easy reporting)
  count             numeric,
  linear_feet       numeric,
  stair_floors      numeric,
  door_count        numeric,
  window_count      numeric,
  handrail_count    numeric,

  sort_order        integer,

  -- Zoho linkage
  zoho_work_id      varchar,      -- Zoho Work Performed record id (set after sync)

  created_at        timestamptz DEFAULT now()
);

CREATE INDEX wpe_timesheet_id_idx ON work_performed_entries (timesheet_id);
CREATE INDEX wpe_task_code_idx ON work_performed_entries (task_code);
CREATE INDEX wpe_area_group_task_idx ON work_performed_entries (area, group_code, task_code);
```

**Drizzle sketch (`src/lib/schema.ts`):**

```ts
export const workPerformedEntries = pgTable('work_performed_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  timesheetId: varchar('timesheet_id').notNull(),
  area: text('area').notNull(),
  groupCode: text('group_code').notNull(),
  groupLabel: text('group_label').notNull(),
  taskCode: text('task_code').notNull(),
  taskLabel: text('task_label').notNull(),
  quantity: numeric('quantity').notNull().default('0'),
  laborMinutes: integer('labor_minutes').notNull().default(0),
  paintGallons: numeric('paint_gallons').notNull().default('0'),
  primerGallons: numeric('primer_gallons').notNull().default('0'),
  primerSource: text('primer_source').notNull().default('stock'),
  count: numeric('count'),
  linearFeet: numeric('linear_feet'),
  stairFloors: numeric('stair_floors'),
  doorCount: numeric('door_count'),
  windowCount: numeric('window_count'),
  handrailCount: numeric('handrail_count'),
  sortOrder: integer('sort_order'),
  zohoWorkId: varchar('zoho_work_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  timesheetIdx: index('wpe_timesheet_id_idx').on(table.timesheetId),
  taskCodeIdx: index('wpe_task_code_idx').on(table.taskCode),
}));
```

> **Rationale:** Flattening the optional `measurements` object into numeric columns keeps reporting simple (no JSONB casting in SQL) while still honoring the UI’s metadata-driven behavior.

#### 3.2 Extend `timesheet_painters` with a `section` column

**Goal:** Store **both** customer and T&M painters in the same junction table, with an explicit section flag.

**SQL migration:**

```sql
ALTER TABLE timesheet_painters
ADD COLUMN section text NOT NULL DEFAULT 'customer'; -- 'customer' | 'tm'

CREATE INDEX tp_section_idx ON timesheet_painters (section);
```

**Drizzle update:**

```ts
section: text('section').notNull().default('customer'),
```

UI / API mapping:

- Customer crew rows → `section = 'customer'` (current behavior).
- T&M crew rows (from `tmExtraWork.painters`) → `section = 'tm'`.

#### 3.3 T&M header fields on `time_entries`

We already store:

- `extraHours` (string) – currently used for T&M total hours.
- `extraWorkDescription` (string) – currently used for T&M notes.

To better mirror the new `tmExtraWork` object while remaining backward compatible:

```sql
ALTER TABLE time_entries
ADD COLUMN tm_enabled boolean NOT NULL DEFAULT false;
```

**Usage:**

- `tm_enabled = true` when the user toggles **T&M Extra Work** on.
- `extraHours` and `extraWorkDescription` continue to store T&M totals/notes so existing reports do not break.

> If we later want full fidelity of T&M crew rows in reports, we can aggregate from `timesheet_painters WHERE section = 'tm'`.

---

### 4. API Changes (`/api/time-entries`)

#### 4.1 Persist Work Performed to `work_performed_entries`

In `POST /api/time-entries`:

1. After validating the payload and inserting the `time_entries` parent row:
   - Map each `validated.workPerformed` entry to a `work_performed_entries` insert.
2. Preserve numeric safety:
   - Coerce `quantity`, `paintGallonsUsed`, `primerGallonsUsed`, `laborMinutes` and each `measurements` value to `>= 0`.
3. Store `sortOrder` as its array index to preserve UI ordering.

**Pseudocode:**

```ts
const workRows = (validated.workPerformed ?? []).map((w, index) => ({
  timesheetId,
  area: w.area,
  groupCode: w.groupCode,
  groupLabel: w.groupLabel,
  taskCode: w.taskCode,
  taskLabel: w.taskLabel,
  quantity: w.quantity,
  laborMinutes: w.laborMinutes ?? 0,
  paintGallons: w.paintGallonsUsed,
  primerGallons: w.primerGallonsUsed,
  primerSource: w.primerSource,
  count: w.measurements?.count,
  linearFeet: w.measurements?.linearFeet,
  stairFloors: w.measurements?.stairFloors,
  doorCount: w.measurements?.doorCount,
  windowCount: w.measurements?.windowCount,
  handrailCount: w.measurements?.handrailCount,
  sortOrder: w.sortOrder ?? index,
}));

if (workRows.length > 0) {
  await db.insert(workPerformedEntries).values(workRows);
}
```

#### 4.2 Persist T&M Extra Work crew rows

Still inside `POST /api/time-entries`:

1. **Existing behavior**: insert customer painters into `timesheet_painters`.
2. **New behavior**:
   - If `validated.tmExtraWork` is present and has `painters.length > 0`:
     - Mark `tm_enabled = true` on the parent.
     - Insert a second set of junction rows with `section = 'tm'`.

**Pseudocode:**

```ts
const tm = validated.tmExtraWork;
let tmTotalHours = 0;

if (tm && tm.painters && tm.painters.length > 0) {
  const tmRows = tm.painters.map((p) => {
    const totalHours = computeTotalHours(p.startTime, p.endTime, p.lunchStart ?? '', p.lunchEnd ?? '');
    tmTotalHours += totalHours;
    return {
      timesheetId,
      painterId: p.painterId,
      painterName: p.painterName,
      startTime: p.startTime,
      endTime: p.endTime,
      lunchStart: p.lunchStart ?? '',
      lunchEnd: p.lunchEnd ?? '',
      totalHours: String(totalHours),
      section: 'tm',
    };
  });
  await db.insert(timesheetPainters).values(tmRows);

  // Keep legacy fields aligned
  parentValues.tmEnabled = true;
  parentValues.extraHours = String(tmTotalHours.toFixed(2));
  parentValues.extraWorkDescription = (tm.notes ?? '').trim();
}
```

#### 4.3 GET shape: include Work Performed + grouped painters

For `GET /api/time-entries`:

1. For each timesheet row:
   - Load related `work_performed_entries` and attach as `workPerformed[]`.
   - Load painters from `timesheet_painters` and group them by `section`:
     - `customerPainters = rows.filter(r => r.section === 'customer')`
     - `tmPainters = rows.filter(r => r.section === 'tm')`
2. Optionally expose a derived `tmExtraWork` block for the frontend history view:

```ts
tmExtraWork: tmPainters.length
  ? {
      painters: tmPainters,
      totalHours: tmPainters.reduce((sum, p) => sum + parseFloat(p.totalHours), 0),
      notes: te.extraWorkDescription ?? '',
    }
  : null,
```

> **Note:** The existing `/entry/new` page already has all the UI state; this step ensures history/detail views can render both customer and T&M sections consistently.

---

### 5. Zoho CRM Data Model

#### 5.1 New module: `Work_Performed` (custom module)

**Purpose:** One Zoho record per `work_performed_entries` row.

**Proposed Zoho fields:**

| Field API Name        | Type        | Notes                                      |
| --------------------- | ----------- | ------------------------------------------ |
| `Time_Entry`          | Lookup      | → `Time_Entries` parent                    |
| `Area`                | Picklist    | `Interior` / `Exterior`                    |
| `Group_Code`          | Text        | From `groupCode`                           |
| `Group_Label`         | Text        | From `groupLabel`                          |
| `Task_Code`           | Text        | From `taskCode`                            |
| `Task_Label`          | Text        | From `taskLabel`                           |
| `Quantity`            | Number      | Main production quantity                    |
| `Labor_Minutes`       | Number      | Optional labor minutes                      |
| `Paint_Gallons`       | Number      | Per-task paint usage                        |
| `Primer_Gallons`      | Number      | Per-task primer usage                       |
| `Primer_Source`       | Picklist    | `Stock` / `Purchased` (retail)             |
| `Count`               | Number      | Optional                                   |
| `Linear_Feet`         | Number      | Optional                                   |
| `Stair_Floors`        | Number      | Optional                                   |
| `Door_Count`          | Number      | Optional                                   |
| `Window_Count`        | Number      | Optional                                   |
| `Handrail_Count`      | Number      | Optional                                   |
| `Sort_Order`          | Number      | For stable UI ordering                      |

> **Naming:** Keep API names short but descriptive. If Zoho auto-renames, store actual API names in env vars (e.g., `ZOHO_WORK_PERFORMED_MODULE_NAME`).

#### 5.2 Extend `Time_Entries_X_Painters` junction for T&M

Instead of creating a brand-new junction module for T&M, we add a **section flag**:

| Field API Name | Type     | Notes                                      |
| -------------- | -------- | ------------------------------------------ |
| `Section`      | Picklist | `Customer`, `T&M Extra Work` (default Customer) |

**Mapping:**

- Customer rows → `Section = 'Customer'`.
- T&M crew rows → `Section = 'T&M Extra Work'`.

> This keeps all painter-related data in a single module while allowing filters and reports that separate T&M from customer work.

#### 5.3 Optional header fields on `Time_Entries`

If needed for reporting:

| Field API Name          | Type     | Notes                                |
| ----------------------- | -------- | ------------------------------------ |
| `TM_Enabled`            | Boolean  | Mirrors `time_entries.tm_enabled`    |
| `TM_Total_Hours`        | Number   | Mirrors T&M hours sum                |
| `TM_Extra_Work_Notes`   | TextArea | Mirrors `extraWorkDescription`       |

These are redundant (derivable from junction rows + notes) but convenient for high-level reporting in Zoho.

---

### 6. Zoho Sync Logic Changes

All of this builds on `syncTimesheetToZoho` and `retryFailedSyncs` in `src/lib/sync-utils.ts`.

#### 6.1 New API client methods (`src/lib/zoho.ts`)

- **`createWorkPerformedEntry`**

```ts
async createWorkPerformedEntry(data: {
  zohoTimeEntryId: string;
  area: 'interior' | 'exterior';
  groupCode: string;
  groupLabel: string;
  taskCode: string;
  taskLabel: string;
  quantity: number;
  laborMinutes?: number;
  paintGallons: number;
  primerGallons: number;
  primerSource: 'stock' | 'retail';
  measurements?: {
    count?: number;
    linearFeet?: number;
    stairFloors?: number;
    doorCount?: number;
    windowCount?: number;
    handrailCount?: number;
  };
  sortOrder?: number;
}): Promise<{ id: string }>
```

- **`createTimesheetPainterEntry`** (extension)
  - Add a `section` parameter mapped to the new picklist field.

```ts
async createTimesheetPainterEntry(data: {
  zohoTimeEntryId: string;
  painterId: string;
  date: string;
  startTime: string;
  endTime: string;
  lunchStart?: string;
  lunchEnd?: string;
  totalHours: string;
  timezone: string;
  section: 'Customer' | 'T&M Extra Work';
})
```

#### 6.2 `syncTimesheetToZoho` – extended phases

Given a `TimesheetData` object (already used today):

1. **Phase 1 – Parent Time_Entry**
   - Unchanged: create/update the `Time_Entries` parent record.
2. **Phase 2 – Junction painters**
   - When creating junction rows, set `Section` field based on `section` column:
     - `section === 'customer'` → `Section = 'Customer'`.
     - `section === 'tm'` → `Section = 'T&M Extra Work'`.
3. **Phase 3 – Work_Performed children (NEW)**
   - For each `work_performed_entries` row where `zoho_work_id IS NULL`:
     - Call `createWorkPerformedEntry` with:
       - `Time_Entry` lookup set to the Zoho parent id.
       - All fields mapped from the Postgres row.
     - Save the returned id into `work_performed_entries.zoho_work_id`.
4. **Phase 4 – Completion flag**
   - Mark `time_entries.synced = true` only when:
     - Parent record exists (`zoho_time_entry_id` set).
     - All `timesheet_painters` rows have `zoho_junction_id != NULL`.
     - All `work_performed_entries` rows have `zoho_work_id != NULL`.

`retryFailedSyncs` should be updated to:

- Reload related `timesheet_painters` and `work_performed_entries` rows.
- Retry whichever phase(s) are incomplete (missing any of the above IDs).

---

### 7. Implementation Order

**Phase 1 – Database (Supabase)**

1. Add `work_performed_entries` table (SQL + Drizzle).
2. Add `section` column to `timesheet_painters` (default `'customer'`).
3. Add `tm_enabled` column to `time_entries`.
4. Run `pnpm db:push` and verify via Drizzle Studio.

**Phase 2 – API Persistence**

1. Update `POST /api/time-entries` to:
   - Insert Work Performed rows after parent insert.
   - Insert T&M junction rows (`section = 'tm'`) when `tmExtraWork` is present.
   - Keep `extraHours` + `extraWorkDescription` aligned with T&M totals/notes.
2. Update `GET /api/time-entries` to:
   - Attach `workPerformed[]` from `work_performed_entries`.
   - Group painters by `section` and expose a `tmExtraWork` block when present.

**Phase 3 – Zoho Configuration**

1. Create `Work_Performed` custom module with fields listed above.
2. Add `Section` picklist field to `Time_Entries_X_Painters` module.
3. (Optional) Add `TM_Enabled`, `TM_Total_Hours`, `TM_Extra_Work_Notes` fields to `Time_Entries`.
4. Document actual API names and set env vars if needed.

**Phase 4 – Zoho Client + Sync**

1. Implement `createWorkPerformedEntry` and extend `createTimesheetPainterEntry` with `section`.
2. Extend `syncTimesheetToZoho`:
   - Add Phase 3 for Work_Performed children.
   - Update completion logic to consider Work_Performed + T&M sections.
3. Extend `retryFailedSyncs` to retry missing Work_Performed and T&M sections.

**Phase 5 – Validation & Reporting**

1. Add integration tests / manual test scripts for:
   - Timesheet with Work Performed only.
   - Timesheet with T&M only.
   - Timesheet with both Work Performed and T&M.
2. Build Zoho reports:
   - Work Performed by job / date / area / group / task.
   - T&M hours and notes per job, filtered by `Section = 'T&M Extra Work'`.

---

### 8. Backwards Compatibility Notes

- Existing timesheets **without** Work Performed or T&M:
  - Continue to function; new columns are nullable or have safe defaults.
- Existing Zoho integration:
  - Parent + painter sync continues to work; Work_Performed and `Section` fields are additive.
- Rollback path:
  - If Work Performed sync causes issues, we can temporarily disable Phase 3 while keeping database inserts (data will be waiting to sync later).
  - T&M section rows in `timesheet_painters` can be ignored by setting Zoho filters to `Section = 'Customer'` only.

