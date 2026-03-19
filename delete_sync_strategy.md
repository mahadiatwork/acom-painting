# Delete Sync Strategy

## Goal
When a record is deleted in Zoho CRM, Zoho’s delete trigger only provides the record id. We will use that id to find and delete/anonymize the corresponding records in Supabase without fetching additional data from Zoho.

## Supabase actions by module
### Portal_Users (Zoho) → foremen (Supabase)
- Find foreman: `foremen.zoho_id == record_id`
- Delete that foreman row
- Preserve history by anonymizing references:
  - `time_entries`: set `foreman_id = null` where `foreman_id == deleted foreman.id`
  - `work_entries`: set `foreman_id = 'DELETED:<zohoId>'` (or null if allowed)
- Log the event

### Deals (Zoho) → projects (Supabase)
- Delete project row: `projects.id == record_id`
- Preserve history by rewriting job references:
  - `time_entries`: if `job_id == record_id`, set `job_id = 'DELETED:<id>'`, `job_name = 'Deleted Project'`
  - `work_entries`: same `job_id/job_name` rewrite
- Log the event

### Painters (Zoho) → painters (Supabase)
- Delete painter row: `painters.id == record_id`
- Preserve history by anonymizing crew rows:
  - `timesheet_painters`: if `painter_id == record_id`, set `painter_id = 'DELETED:<id>'`, `painter_name = 'Deleted Painter'`
  - `work_entry_crew_rows`: same rewrite
- Log the event

### Foremen (Zoho) → foremen (Supabase)
- Same flow as Portal_Users delete, matching `foremen.zoho_id == record_id`

## App-side webhook (Next.js API)
- New endpoint, e.g. `/api/zoho/delete`
- Method: POST
- Body: `{ module: string, id: string }`
- Header: `X-Zoho-Delete-Secret: <secret>` (env: `ZOHO_DELETE_WEBHOOK_SECRET`)
- Idempotent: track events in a `zoho_delete_events` table with unique `(module, zoho_id)`; if already processed, return 200 OK
- Actions per module as defined above
- Audit log each event

## Zoho CRM configuration
### Deluge function (generic)
- Inputs: `moduleName`, `recordId`
- Build payload `{ module: moduleName, id: recordId }`
- `invokeurl` POST to `/api/webhooks/delete` with the shared secret
- Log response

Example Deluge function body:
```deluge
moduleName = ifnull(input.moduleName, "");
recordId = ifnull(input.recordId, "");

if(moduleName != "" && recordId != "")
{
    payload = {"module":moduleName,"id":recordId};

    response = invokeurl
    [
        url : "https://YOUR_DOMAIN/api/webhooks/delete"
        type : POST
        headers : {"Content-Type":"application/json","x-zoho-delete-secret":"YOUR_SHARED_SECRET"}
        body : payload.toString()
    ];

    info "Delete webhook response: " + response;
}
else
{
    info "Delete webhook skipped: missing moduleName or recordId";
}
```

### Workflows (On Delete)
Create 4 workflows in Zoho CRM:
- `Portal_Users` → run Deluge with `moduleName = "Portal_Users"`, `recordId = ${Portal_Users.ID}`
- `Deals` → run Deluge with `moduleName = "Deals"`, `recordId = ${Deals.ID}`
- `Painters` → run Deluge with `moduleName = "Painters"`, `recordId = ${Painters.ID}`
- `Foremen` → run Deluge with `moduleName = "Foremen"`, `recordId = ${Foremen.ID}`

All 4 workflows should be configured for the **Delete** event.

### App webhook endpoint contract
- URL: `/api/webhooks/delete`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `x-zoho-delete-secret: <same value as ZOHO_WEBHOOK_SECRET>`
- Body:
```json
{
  "module": "Deals",
  "id": "6838013000000977057"
}
```

Supported module values (case-insensitive):
- `Portal_Users`
- `Foremen`
- `Deals`
- `Painters`

The endpoint is idempotent in practice: if the record is already deleted or was never synced, it returns success with an informational reason instead of failing.

### Implemented app-side file
- `src/app/api/webhooks/delete/route.ts`

Security note:
- In production, set `ZOHO_WEBHOOK_SECRET` in the app environment and use that exact value in the Deluge header `x-zoho-delete-secret`.
- Use HTTPS endpoint only.

### Current anonymize behavior implemented
- Foreman delete:
  - delete from `foremen`
  - anonymize `time_entries.foreman_id` to `null`
  - anonymize `work_entries.foreman_id` to `DELETED:<zohoId>`
- Deal delete:
  - delete from `projects`
  - anonymize `time_entries.job_id/job_name` and `work_entries.job_id/job_name`
- Painter delete:
  - delete from `painters`
  - anonymize `timesheet_painters` and `work_entry_crew_rows` painter references
  - clear Zoho row ids on anonymized rows so history remains but references are detached

Potential enhancement:
- Add a dedicated table (e.g. `zoho_delete_events`) to persist delete event logs with uniqueness on `(module, zoho_id)` for hard idempotency tracking.

### Quick test with curl
```bash
curl -X POST "https://YOUR_DOMAIN/api/webhooks/delete" \
  -H "Content-Type: application/json" \
  -H "x-zoho-delete-secret: YOUR_SHARED_SECRET" \
  -d '{"module":"Deals","id":"6838013000000977057"}'
```
Expect JSON with `success: true` and delete/anonymize status.

### Workflows (On Delete)
- Portal_Users → call function with `moduleName = Portal_Users`
- Deals → `moduleName = Deals`
- Painters → `moduleName = Painters`
- Foremen → `moduleName = Foremen`

## Testing checklist
- Delete a Portal User: foreman removed; timesheets/work entries preserved with anonymized foreman references.
- Delete a Deal: project removed; timesheets/work entries preserved with `Deleted Project` job reference.
- Delete a Painter: painter removed; crew rows preserved as `Deleted Painter`.
- Delete a Foreman: same as Portal User case.

## Notes
- History is preserved; only sensitive reference fields are anonymized.
- Repeated delete calls are safe (idempotent processing).
- No additional Zoho fetch is required—only the provided record id is used.