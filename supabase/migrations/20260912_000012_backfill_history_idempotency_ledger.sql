alter table public.feelcycle_history_occurrences
  add column if not exists applied_to_aggregate boolean;

-- The original ledger seed rows were copied from schedules already represented
-- by the five-year aggregate. Rows inserted by later RPC calls were aggregated.
update public.feelcycle_history_occurrences
set applied_to_aggregate = processed_at <> (
  select min(processed_at) from public.feelcycle_history_occurrences
)
where applied_to_aggregate is null;

alter table public.feelcycle_history_occurrences
  alter column applied_to_aggregate set default true,
  alter column applied_to_aggregate set not null;

create or replace function public.register_feelcycle_history_baseline_occurrences(entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  existing public.feelcycle_history_occurrences%rowtype;
  affected_rows integer;
  registered_count integer := 0;
  corrected_count integer := 0;
  skipped_count integer := 0;
begin
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  for entry in select value from jsonb_array_elements(entries)
  loop
    select * into existing
    from public.feelcycle_history_occurrences
    where schedule_id = entry->>'schedule_id'
      and instructor_id = entry->>'instructor_id'
    for update;

    if not found then
      insert into public.feelcycle_history_occurrences (
        schedule_id, instructor_id, lesson_id, store_id, lesson_date, lesson_start,
        applied_to_aggregate
      ) values (
        entry->>'schedule_id',
        entry->>'instructor_id',
        entry->>'lesson_id',
        (entry->>'store_id')::integer,
        (entry->>'lesson_date')::date,
        nullif(entry->>'lesson_start', '')::time,
        false
      );
      registered_count := registered_count + 1;
      continue;
    end if;

    if existing.lesson_id <> entry->>'lesson_id'
      or existing.store_id <> (entry->>'store_id')::integer
      or existing.lesson_date <> (entry->>'lesson_date')::date then
      raise exception 'Baseline occurrence does not match ledger row: %', entry->>'schedule_id';
    end if;

    if not existing.applied_to_aggregate then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    update public.feelcycle_lesson_instructor_studios
    set occurrence_count = occurrence_count - 1,
      updated_at = now()
    where lesson_id = existing.lesson_id
      and instructor_id = existing.instructor_id
      and store_id = existing.store_id
      and occurrence_count > 1;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'Cannot safely correct studio aggregate for schedule %', existing.schedule_id;
    end if;

    update public.feelcycle_lesson_instructors
    set observed_count = observed_count - 1,
      updated_at = now()
    where lesson_id = existing.lesson_id
      and instructor_id = existing.instructor_id
      and observed_count > 1;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'Cannot safely correct instructor aggregate for schedule %', existing.schedule_id;
    end if;

    update public.feelcycle_history_occurrences
    set applied_to_aggregate = false
    where schedule_id = existing.schedule_id
      and instructor_id = existing.instructor_id;
    corrected_count := corrected_count + 1;
  end loop;

  return jsonb_build_object(
    'registered', registered_count,
    'corrected', corrected_count,
    'skipped', skipped_count
  );
end;
$$;

revoke all on function public.register_feelcycle_history_baseline_occurrences(jsonb) from public;
grant execute on function public.register_feelcycle_history_baseline_occurrences(jsonb) to service_role;

create or replace function public.apply_feelcycle_history_occurrences(entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry jsonb;
  inserted_rows integer;
  processed_count integer := 0;
  skipped_count integer := 0;
  taught_at timestamptz;
begin
  if jsonb_typeof(entries) <> 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  for entry in select value from jsonb_array_elements(entries)
  loop
    insert into public.feelcycle_history_occurrences (
      schedule_id, instructor_id, lesson_id, store_id, lesson_date, lesson_start,
      applied_to_aggregate
    ) values (
      entry->>'schedule_id',
      entry->>'instructor_id',
      entry->>'lesson_id',
      (entry->>'store_id')::integer,
      (entry->>'lesson_date')::date,
      nullif(entry->>'lesson_start', '')::time,
      true
    )
    on conflict (schedule_id, instructor_id) do nothing;

    get diagnostics inserted_rows = row_count;
    if inserted_rows = 0 then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    processed_count := processed_count + 1;
    taught_at := (entry->>'lesson_date')::date::timestamp at time zone 'Asia/Tokyo';

    insert into public.feelcycle_lesson_instructor_studios (
      lesson_id, instructor_id, store_id, first_taught_on, last_taught_on,
      occurrence_count, source, updated_at
    ) values (
      entry->>'lesson_id',
      entry->>'instructor_id',
      (entry->>'store_id')::integer,
      (entry->>'lesson_date')::date,
      (entry->>'lesson_date')::date,
      1,
      'official_schedule_incremental',
      now()
    )
    on conflict (lesson_id, instructor_id, store_id) do update set
      first_taught_on = least(feelcycle_lesson_instructor_studios.first_taught_on, excluded.first_taught_on),
      last_taught_on = greatest(feelcycle_lesson_instructor_studios.last_taught_on, excluded.last_taught_on),
      occurrence_count = feelcycle_lesson_instructor_studios.occurrence_count + 1,
      updated_at = now();

    insert into public.feelcycle_lesson_instructors (
      lesson_id, instructor_id, source, first_observed_at, last_observed_at,
      observed_count, updated_at
    ) values (
      entry->>'lesson_id',
      entry->>'instructor_id',
      'official_schedule_incremental',
      taught_at,
      taught_at,
      1,
      now()
    )
    on conflict (lesson_id, instructor_id) do update set
      first_observed_at = least(feelcycle_lesson_instructors.first_observed_at, excluded.first_observed_at),
      last_observed_at = greatest(feelcycle_lesson_instructors.last_observed_at, excluded.last_observed_at),
      observed_count = feelcycle_lesson_instructors.observed_count + 1,
      updated_at = now();
  end loop;

  return jsonb_build_object('processed', processed_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.apply_feelcycle_history_occurrences(jsonb) from public;
grant execute on function public.apply_feelcycle_history_occurrences(jsonb) to service_role;

comment on function public.register_feelcycle_history_baseline_occurrences(jsonb) is
  'Registers exact schedule keys from the historical snapshot and reverses an incremental count only when that same key was previously applied.';

