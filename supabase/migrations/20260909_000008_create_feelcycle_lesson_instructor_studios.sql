create table if not exists public.feelcycle_lesson_instructor_studios (
  lesson_id text not null references public.feelcycle_lessons (id) on delete cascade,
  instructor_id text not null references public.feelcycle_instructors (id) on delete cascade,
  store_id integer not null references public.feelcycle_studios (id) on delete cascade,
  first_taught_on date not null,
  last_taught_on date not null,
  occurrence_count integer not null check (occurrence_count > 0),
  source text not null default 'official_schedule_history',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, instructor_id, store_id)
);

create index if not exists feelcycle_lesson_instructor_studios_instructor_idx
  on public.feelcycle_lesson_instructor_studios (instructor_id, last_taught_on desc);

create index if not exists feelcycle_lesson_instructor_studios_lesson_idx
  on public.feelcycle_lesson_instructor_studios (lesson_id, last_taught_on desc);

create index if not exists feelcycle_lesson_instructor_studios_store_idx
  on public.feelcycle_lesson_instructor_studios (store_id, last_taught_on desc);

comment on table public.feelcycle_lesson_instructor_studios is
  'Five-year aggregate of official lesson, instructor, and studio combinations with observed teaching dates and counts.';
