-- Verification script for new work_entries persistence model
-- Usage:
-- 1) Submit one timesheet with exactly: 1 main entry + 2 T&M entries.
-- 2) Replace target_main_entry_id below with the returned main entry id.
-- 3) Run this script in Supabase SQL Editor or psql.

begin;

-- -----------------------------------------------------------------------------
-- INPUTS (replace values for your verification run)
-- -----------------------------------------------------------------------------
with verify_input as (
  select
    '00000000-0000-0000-0000-000000000000'::uuid as target_main_entry_id,
    2::int as expected_tm_children
),
entry_tree as (
  select we.id, we.entry_type, we.parent_entry_id
  from work_entries we
  join verify_input v on we.id = v.target_main_entry_id
  union all
  select child.id, child.entry_type, child.parent_entry_id
  from work_entries child
  join verify_input v on child.parent_entry_id = v.target_main_entry_id
),
main_row as (
  select count(*)::int as c
  from work_entries we
  join verify_input v on we.id = v.target_main_entry_id
  where we.entry_type = 'main'
),
tm_children as (
  select count(*)::int as c
  from work_entries we
  join verify_input v on we.parent_entry_id = v.target_main_entry_id
  where we.entry_type = 'tm_extra'
),
orphan_crew as (
  select count(*)::int as c
  from work_entry_crew_rows c
  left join work_entries we on we.id = c.work_entry_id
  where we.id is null
),
orphan_sundry as (
  select count(*)::int as c
  from work_entry_sundry_rows s
  left join work_entries we on we.id = s.work_entry_id
  where we.id is null
),
orphan_work as (
  select count(*)::int as c
  from work_entry_work_rows w
  left join work_entries we on we.id = w.work_entry_id
  where we.id is null
),
assertions as (
  select
    (select c from main_row) = 1 as ok_main_exists,
    (select c from tm_children) = (select expected_tm_children from verify_input) as ok_tm_count,
    (select c from orphan_crew) = 0 as ok_crew_fk,
    (select c from orphan_sundry) = 0 as ok_sundry_fk,
    (select c from orphan_work) = 0 as ok_work_fk
)
select
  ok_main_exists,
  ok_tm_count,
  ok_crew_fk,
  ok_sundry_fk,
  ok_work_fk
from assertions;

-- Hard assertions: fail fast if anything above is false.
do $$
declare
  v_main_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_expected_tm int := 2;
  v_main_count int;
  v_tm_count int;
  v_orphan_crew int;
  v_orphan_sundry int;
  v_orphan_work int;
begin
  select count(*) into v_main_count
  from work_entries
  where id = v_main_id and entry_type = 'main';

  if v_main_count <> 1 then
    raise exception 'Verification failed: expected 1 main row for %, got %', v_main_id, v_main_count;
  end if;

  select count(*) into v_tm_count
  from work_entries
  where parent_entry_id = v_main_id and entry_type = 'tm_extra';

  if v_tm_count <> v_expected_tm then
    raise exception 'Verification failed: expected % tm children for %, got %', v_expected_tm, v_main_id, v_tm_count;
  end if;

  select count(*) into v_orphan_crew
  from work_entry_crew_rows c
  left join work_entries we on we.id = c.work_entry_id
  where we.id is null;

  if v_orphan_crew <> 0 then
    raise exception 'Verification failed: found % orphan crew rows', v_orphan_crew;
  end if;

  select count(*) into v_orphan_sundry
  from work_entry_sundry_rows s
  left join work_entries we on we.id = s.work_entry_id
  where we.id is null;

  if v_orphan_sundry <> 0 then
    raise exception 'Verification failed: found % orphan sundry rows', v_orphan_sundry;
  end if;

  select count(*) into v_orphan_work
  from work_entry_work_rows w
  left join work_entries we on we.id = w.work_entry_id
  where we.id is null;

  if v_orphan_work <> 0 then
    raise exception 'Verification failed: found % orphan work rows', v_orphan_work;
  end if;

  raise notice 'Verification passed for main entry %', v_main_id;
end $$;

-- -----------------------------------------------------------------------------
-- Relationship detail queries (manual inspection artifacts)
-- -----------------------------------------------------------------------------

-- A) Main + T&M tree rows and parent linkage
with verify_input as (
  select '00000000-0000-0000-0000-000000000000'::uuid as target_main_entry_id
)
select
  we.id,
  we.entry_type,
  we.parent_entry_id,
  we.tm_sequence,
  we.display_label,
  we.total_crew_hours,
  we.tm_count,
  we.tm_total_hours,
  we.grand_total_hours
from work_entries we
join verify_input v
  on we.id = v.target_main_entry_id
  or we.parent_entry_id = v.target_main_entry_id
order by
  case when we.entry_type = 'main' then 0 else 1 end,
  we.tm_sequence nulls first,
  we.created_at;

-- B) Child rows linked to the correct work_entry_id across crew/sundry/work tables
with verify_input as (
  select '00000000-0000-0000-0000-000000000000'::uuid as target_main_entry_id
),
entry_tree as (
  select we.id, we.entry_type
  from work_entries we
  join verify_input v on we.id = v.target_main_entry_id
  union all
  select child.id, child.entry_type
  from work_entries child
  join verify_input v on child.parent_entry_id = v.target_main_entry_id
)
select
  'work_entry_crew_rows' as child_table,
  et.id as work_entry_id,
  et.entry_type,
  count(c.id)::int as child_count
from entry_tree et
left join work_entry_crew_rows c on c.work_entry_id = et.id
group by et.id, et.entry_type

union all

select
  'work_entry_sundry_rows' as child_table,
  et.id as work_entry_id,
  et.entry_type,
  count(s.id)::int as child_count
from entry_tree et
left join work_entry_sundry_rows s on s.work_entry_id = et.id
group by et.id, et.entry_type

union all

select
  'work_entry_work_rows' as child_table,
  et.id as work_entry_id,
  et.entry_type,
  count(w.id)::int as child_count
from entry_tree et
left join work_entry_work_rows w on w.work_entry_id = et.id
group by et.id, et.entry_type

order by child_table, entry_type, work_entry_id;

rollback;
