# Work Entries Persistence Verification Notes

This project currently has no automated test framework configured in `package.json`.
Verification is implemented with a runnable SQL artifact: `VERIFY_WORK_ENTRIES_PERSISTENCE.sql`.

## Prerequisites

1. Phase 1 migration already applied (`WORK_ENTRIES_PHASE1_MIGRATION.sql`).
2. Deployed app is running with updated POST `/api/time-entries` behavior.
3. You can execute SQL in Supabase SQL Editor (or `psql` against the same database).

## Verification Procedure

1. Submit one timesheet payload that creates:
   - 1 main entry
   - 2 T&M entries (`tmEntries` length = 2)
2. Capture the response `id` (this is the main work entry id).
3. Open `VERIFY_WORK_ENTRIES_PERSISTENCE.sql` and replace all placeholder UUID values:
   - `00000000-0000-0000-0000-000000000000` -> your captured main entry id
4. Run the SQL script.

## Expected Result

The script validates and/or surfaces all required checks:

- `work_entries` has exactly 1 main row and 2 `tm_extra` children for the target id.
- Each tm row has `parent_entry_id` equal to the target main id.
- Child tables are linked by valid `work_entry_id`:
  - `work_entry_crew_rows`
  - `work_entry_sundry_rows`
  - `work_entry_work_rows`

If a hard assertion fails, the `DO $$ ... $$` block raises an exception with the failure reason.
If successful, it emits a `NOTICE` indicating verification passed.

## Local Type Check

Run:

- `npm run check`

This ensures TypeScript compiles after adding verification artifacts.
