create table if not exists public.feelcycle_studios (
  id integer primary key,
  studio_name text not null,
  studio_code text,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feelcycle_instructors
  add column if not exists official_id integer;

create unique index if not exists feelcycle_instructors_official_id_idx
  on public.feelcycle_instructors (official_id)
  where official_id is not null;

create table if not exists public.feelcycle_schedule_occurrences (
  schedule_id text not null,
  instructor_id text not null references public.feelcycle_instructors (id) on delete cascade,
  official_instructor_id integer,
  lesson_id text not null references public.feelcycle_lessons (id) on delete cascade,
  store_id integer not null references public.feelcycle_studios (id) on delete cascade,
  lesson_date date not null,
  lesson_start time,
  lesson_end time,
  status integer,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, instructor_id)
);

create index if not exists feelcycle_schedule_occurrences_instructor_idx
  on public.feelcycle_schedule_occurrences (instructor_id, lesson_date desc);

create index if not exists feelcycle_schedule_occurrences_lesson_idx
  on public.feelcycle_schedule_occurrences (lesson_id, lesson_date desc);

create index if not exists feelcycle_schedule_occurrences_store_idx
  on public.feelcycle_schedule_occurrences (store_id, lesson_date desc);

comment on table public.feelcycle_schedule_occurrences is
  'Official published schedule rows. One row is stored per schedule and instructor so team-taught lessons remain queryable.';
