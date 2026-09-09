create table if not exists public.feelcycle_history_occurrences (
  schedule_id text not null,
  instructor_id text not null references public.feelcycle_instructors (id) on delete cascade,
  lesson_id text not null references public.feelcycle_lessons (id) on delete cascade,
  store_id integer not null references public.feelcycle_studios (id) on delete cascade,
  lesson_date date not null,
  lesson_start time,
  processed_at timestamptz not null default now(),
  primary key (schedule_id, instructor_id)
);

create index if not exists feelcycle_history_occurrences_date_idx
  on public.feelcycle_history_occurrences (lesson_date desc);

alter table public.feelcycle_history_occurrences enable row level security;

comment on table public.feelcycle_history_occurrences is
  'Idempotency ledger for schedule rows already applied to the long-term FEELCYCLE history aggregates.';

-- The initial five-year snapshot already contains every schedule currently published.
-- Seed those keys without incrementing aggregates so the first daily run cannot count them twice.
insert into public.feelcycle_history_occurrences (
  schedule_id, instructor_id, lesson_id, store_id, lesson_date, lesson_start, processed_at
)
select schedule_id, instructor_id, lesson_id, store_id, lesson_date, lesson_start, now()
from public.feelcycle_schedule_occurrences
where not exists (select 1 from public.feelcycle_history_occurrences)
on conflict (schedule_id, instructor_id) do nothing;

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
      schedule_id, instructor_id, lesson_id, store_id, lesson_date, lesson_start
    ) values (
      entry->>'schedule_id',
      entry->>'instructor_id',
      entry->>'lesson_id',
      (entry->>'store_id')::integer,
      (entry->>'lesson_date')::date,
      nullif(entry->>'lesson_start', '')::time
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

comment on table public.feelcycle_lesson_instructor_studios is
  'Long-term aggregate of official lesson, instructor, and studio combinations, seeded from 2021-09-09 and updated incrementally.';

comment on view public.feelcycle_program_history_catalogue is
  'One row per program with official instructor and studio teaching history since 2021-09-09.';

comment on view public.feelcycle_instructor_history_catalogue is
  'One row per instructor with official program and studio teaching history since 2021-09-09.';
