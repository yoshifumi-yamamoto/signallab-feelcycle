create extension if not exists pgcrypto;

create table if not exists public.feelcycle_workouts (
  id text primary key,
  workout_date date not null,
  studio text not null,
  program text not null,
  start_time time not null,
  intensity text,
  subjective_memo text not null default '',
  condition_memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feelcycle_workouts_date_idx
  on public.feelcycle_workouts (workout_date desc);

create index if not exists feelcycle_workouts_studio_idx
  on public.feelcycle_workouts (studio);

create index if not exists feelcycle_workouts_program_idx
  on public.feelcycle_workouts (program);
