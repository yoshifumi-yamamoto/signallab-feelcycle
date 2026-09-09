create table if not exists public.feelcycle_lessons (
  id text primary key,
  lesson_name text not null,
  playlist_url text,
  lesson_kind text not null,
  program_family text not null,
  program_series text,
  program_variant text,
  program_version integer,
  parse_rule text not null,
  source text not null default 'workout_history',
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_name)
);

create table if not exists public.feelcycle_instructors (
  id text primary key,
  instructor_name text not null unique,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feelcycle_lesson_instructors (
  lesson_id text not null references public.feelcycle_lessons (id) on delete cascade,
  instructor_id text not null references public.feelcycle_instructors (id) on delete cascade,
  source text not null default 'workout_history',
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  observed_count integer not null default 1 check (observed_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, instructor_id)
);

create index if not exists feelcycle_lessons_family_idx
  on public.feelcycle_lessons (program_family, program_series);

create index if not exists feelcycle_lesson_instructors_instructor_idx
  on public.feelcycle_lesson_instructors (instructor_id);

comment on table public.feelcycle_lessons is
  'Canonical FEELCYCLE lesson catalogue. The playlist catalogue can add lessons before they appear in a member workout history.';

comment on table public.feelcycle_lesson_instructors is
  'Observed lesson-to-instructor assignments. An assignment can change over time and is not treated as a permanent exclusive owner.';
