alter table public.feelcycle_instructor_notes
  add column if not exists want_again boolean not null default false;

create table if not exists public.feelcycle_studio_preferences (
  studio_id integer primary key references public.feelcycle_studios (id) on delete cascade,
  want_again boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.feelcycle_instructor_notes.want_again is
  'Personal marker for instructors the user wants to take again.';

comment on table public.feelcycle_studio_preferences is
  'Personal revisit marker and freeform notes for FEELCYCLE studios.';
