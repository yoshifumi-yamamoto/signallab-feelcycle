alter table public.feelcycle_instructors
  add column if not exists profile_image_url text;

create table if not exists public.feelcycle_instructor_studios (
  instructor_id text not null references public.feelcycle_instructors (id) on delete cascade,
  store_id integer not null references public.feelcycle_studios (id) on delete cascade,
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instructor_id, store_id)
);

create index if not exists feelcycle_instructor_studios_store_idx
  on public.feelcycle_instructor_studios (store_id, instructor_id);

comment on table public.feelcycle_instructor_studios is
  'Current official studio affiliations returned by the FEELCYCLE instructor search API.';
