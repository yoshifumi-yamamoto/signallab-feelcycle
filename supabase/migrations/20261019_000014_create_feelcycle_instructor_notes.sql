create table if not exists public.feelcycle_instructor_notes (
  instructor_id text primary key references public.feelcycle_instructors (id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.feelcycle_instructor_notes is
  'Personal freeform notes attached to canonical FEELCYCLE instructors.';
