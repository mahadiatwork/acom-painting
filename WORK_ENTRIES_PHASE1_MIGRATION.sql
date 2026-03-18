-- Phase 1: Unified Work Entry Architecture (main + T&M children)

create table if not exists work_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null default 'main',
  parent_entry_id uuid null,

  foreman_id text not null,
  job_id text not null,
  job_name text not null,
  entry_date date not null,
  notes text not null default '',
  change_order text not null default '',

  status text not null default 'draft',
  tm_sequence integer null,
  display_label text null,

  total_crew_hours numeric(10,2) not null default 0,
  tm_count integer not null default 0,
  tm_total_hours numeric(10,2) not null default 0,
  tm_total_labor_cost numeric(12,2) not null default 0,
  grand_total_hours numeric(10,2) not null default 0,
  tm_summary_text text not null default '',

  zoho_record_id text null,
  sync_state text not null default 'pending',
  last_sync_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_entries_entry_type_chk check (entry_type in ('main', 'tm_extra')),
  constraint work_entries_status_chk check (status in ('draft', 'submitted', 'synced')),
  constraint work_entries_sync_state_chk check (sync_state in ('pending', 'synced', 'failed')),
  constraint work_entries_parent_fk foreign key (parent_entry_id) references work_entries(id) on delete cascade,
  constraint work_entries_foreman_fk foreign key (foreman_id) references foremen(id) on delete restrict,
  constraint work_entries_job_fk foreign key (job_id) references projects(id) on delete restrict,
  constraint work_entries_parent_shape_chk check (
    (entry_type = 'main' and parent_entry_id is null and tm_sequence is null)
    or
    (entry_type = 'tm_extra' and parent_entry_id is not null and tm_sequence is not null and tm_sequence > 0)
  )
);

create unique index if not exists work_entries_tm_sequence_unique
  on work_entries (parent_entry_id, tm_sequence)
  where entry_type = 'tm_extra';

create index if not exists work_entries_foreman_date_idx on work_entries (foreman_id, entry_date desc);
create index if not exists work_entries_parent_idx on work_entries (parent_entry_id);
create index if not exists work_entries_job_idx on work_entries (job_id);
create index if not exists work_entries_sync_state_idx on work_entries (sync_state);
create index if not exists work_entries_entry_type_idx on work_entries (entry_type);

create table if not exists work_entry_crew_rows (
  id uuid primary key default gen_random_uuid(),
  work_entry_id uuid not null,
  painter_id varchar not null,
  painter_name text not null,
  start_time text not null default '',
  end_time text not null default '',
  lunch_start text not null default '',
  lunch_end text not null default '',
  total_hours numeric(10,2) not null default 0,
  pay_rate_type text null,
  labor_cost numeric(12,2) null,
  zoho_record_id text null,
  sync_state text not null default 'pending',
  created_at timestamptz not null default now(),

  constraint work_entry_crew_rows_work_entry_fk foreign key (work_entry_id) references work_entries(id) on delete cascade,
  constraint work_entry_crew_rows_painter_fk foreign key (painter_id) references painters(id) on delete restrict,
  constraint work_entry_crew_rows_sync_state_chk check (sync_state in ('pending', 'synced', 'failed')),
  constraint work_entry_crew_rows_total_hours_chk check (total_hours >= 0)
);

create index if not exists work_entry_crew_rows_entry_idx on work_entry_crew_rows (work_entry_id);
create index if not exists work_entry_crew_rows_painter_idx on work_entry_crew_rows (painter_id);
create index if not exists work_entry_crew_rows_sync_state_idx on work_entry_crew_rows (sync_state);

create table if not exists work_entry_sundry_rows (
  id uuid primary key default gen_random_uuid(),
  work_entry_id uuid not null,
  sundry_name text not null,
  quantity numeric(10,2) not null default 0,
  unit_cost numeric(12,2) null,
  total_cost numeric(12,2) null,
  zoho_record_id text null,
  sync_state text not null default 'pending',
  created_at timestamptz not null default now(),

  constraint work_entry_sundry_rows_work_entry_fk foreign key (work_entry_id) references work_entries(id) on delete cascade,
  constraint work_entry_sundry_rows_sync_state_chk check (sync_state in ('pending', 'synced', 'failed')),
  constraint work_entry_sundry_rows_quantity_chk check (quantity >= 0)
);

create index if not exists work_entry_sundry_rows_entry_idx on work_entry_sundry_rows (work_entry_id);
create index if not exists work_entry_sundry_rows_sync_state_idx on work_entry_sundry_rows (sync_state);

create table if not exists work_entry_work_rows (
  id uuid primary key default gen_random_uuid(),
  work_entry_id uuid not null,
  area text not null,
  group_code text not null,
  group_label text not null,
  task_code text not null,
  task_label text not null,
  quantity numeric(12,2) not null default 0,
  labor_hours numeric(12,2) not null default 0,
  paint_gallons numeric(12,2) not null default 0,
  primer_gallons numeric(12,2) not null default 0,
  primer_source text not null default 'stock',
  count integer null,
  linear_feet numeric(12,2) null,
  stair_floors integer null,
  door_count integer null,
  window_count integer null,
  handrail_count integer null,
  sort_order integer not null default 0,
  zoho_record_id text null,
  sync_state text not null default 'pending',
  created_at timestamptz not null default now(),

  constraint work_entry_work_rows_work_entry_fk foreign key (work_entry_id) references work_entries(id) on delete cascade,
  constraint work_entry_work_rows_area_chk check (area in ('interior', 'exterior')),
  constraint work_entry_work_rows_primer_source_chk check (primer_source in ('stock', 'retail')),
  constraint work_entry_work_rows_sync_state_chk check (sync_state in ('pending', 'synced', 'failed')),
  constraint work_entry_work_rows_quantity_chk check (quantity >= 0),
  constraint work_entry_work_rows_labor_hours_chk check (labor_hours >= 0),
  constraint work_entry_work_rows_paint_gallons_chk check (paint_gallons >= 0),
  constraint work_entry_work_rows_primer_gallons_chk check (primer_gallons >= 0)
);

create index if not exists work_entry_work_rows_entry_idx on work_entry_work_rows (work_entry_id);
create index if not exists work_entry_work_rows_task_idx on work_entry_work_rows (task_code);
create index if not exists work_entry_work_rows_sync_state_idx on work_entry_work_rows (sync_state);

