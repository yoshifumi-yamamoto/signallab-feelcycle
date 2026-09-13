drop materialized view if exists public.feelcycle_program_catalogue_summary;
drop materialized view if exists public.feelcycle_instructor_catalogue_summary;

create materialized view public.feelcycle_program_catalogue_summary as
with instructor_stats as (
  select assignment.lesson_id, assignment.instructor_id,
    sum(assignment.occurrence_count)::integer as occurrence_count,
    max(assignment.last_taught_on) as last_taught_on
  from public.feelcycle_lesson_instructor_studios assignment
  group by assignment.lesson_id, assignment.instructor_id
), studio_stats as (
  select assignment.lesson_id, assignment.store_id,
    sum(assignment.occurrence_count)::integer as occurrence_count,
    max(assignment.last_taught_on) as last_taught_on
  from public.feelcycle_lesson_instructor_studios assignment
  group by assignment.lesson_id, assignment.store_id
), totals as (
  select assignment.lesson_id,
    min(assignment.first_taught_on) as first_taught_on,
    max(assignment.last_taught_on) as last_taught_on,
    sum(assignment.occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios assignment
  group by assignment.lesson_id
)
select lesson.id, lesson.lesson_name, lesson.program_family,
  case
    when upper(lesson.lesson_name) like 'BSWI %' then 'BSWi'
    when upper(lesson.lesson_name) like 'BSBI %' then 'BSBi'
    when upper(lesson.lesson_name) like 'BB1 %' then 'BB1'
    when upper(lesson.lesson_name) like 'BB2 %' then 'BB2'
    when upper(lesson.lesson_name) like 'BB3 %' then 'BB3'
    when upper(lesson.lesson_name) like 'BSW %' then 'BSW'
    when upper(lesson.lesson_name) like 'BSB %' then 'BSB'
    when upper(lesson.lesson_name) like 'BSL %' then 'BSL'
    else 'その他'
  end as category,
  total.first_taught_on, total.last_taught_on, total.occurrence_count,
  (select count(*)::integer from instructor_stats stat where stat.lesson_id = lesson.id) as instructor_count,
  (select count(*)::integer from studio_stats stat where stat.lesson_id = lesson.id) as studio_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ranked.id, 'name', ranked.name, 'count', ranked.occurrence_count
    ) order by ranked.last_taught_on desc, ranked.occurrence_count desc)
    from (
      select instructor.id, instructor.instructor_name as name,
        stat.occurrence_count, stat.last_taught_on
      from instructor_stats stat
      join public.feelcycle_instructors instructor on instructor.id = stat.instructor_id
      where stat.lesson_id = lesson.id
      order by stat.last_taught_on desc, stat.occurrence_count desc
      limit 5
    ) ranked
  ), '[]'::jsonb) as top_instructors,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ranked.id, 'name', ranked.name, 'code', ranked.code,
      'count', ranked.occurrence_count
    ) order by ranked.last_taught_on desc, ranked.occurrence_count desc)
    from (
      select studio.id, studio.studio_name as name, studio.studio_code as code,
        stat.occurrence_count, stat.last_taught_on
      from studio_stats stat
      join public.feelcycle_studios studio on studio.id = stat.store_id
      where stat.lesson_id = lesson.id
      order by stat.last_taught_on desc, stat.occurrence_count desc
      limit 4
    ) ranked
  ), '[]'::jsonb) as top_studios,
  lower(concat_ws(' ', lesson.lesson_name,
    (select string_agg(instructor.instructor_name, ' ' order by instructor.instructor_name)
      from instructor_stats stat
      join public.feelcycle_instructors instructor on instructor.id = stat.instructor_id
      where stat.lesson_id = lesson.id),
    (select string_agg(concat_ws(' ', studio.studio_name, studio.studio_code), ' ' order by studio.studio_name)
      from studio_stats stat
      join public.feelcycle_studios studio on studio.id = stat.store_id
      where stat.lesson_id = lesson.id)
  )) as search_text
from totals total
join public.feelcycle_lessons lesson on lesson.id = total.lesson_id;

create unique index feelcycle_program_catalogue_summary_id_idx
  on public.feelcycle_program_catalogue_summary (id);
create index feelcycle_program_catalogue_summary_category_idx
  on public.feelcycle_program_catalogue_summary (category, lesson_name);

create materialized view public.feelcycle_instructor_catalogue_summary as
with history_totals as (
  select assignment.instructor_id,
    min(assignment.first_taught_on) as first_taught_on,
    max(assignment.last_taught_on) as last_taught_on,
    sum(assignment.occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios assignment
  group by assignment.instructor_id
), program_stats as (
  select assignment.instructor_id, assignment.lesson_id,
    sum(assignment.occurrence_count)::integer as occurrence_count,
    max(assignment.last_taught_on) as last_taught_on
  from public.feelcycle_lesson_instructor_studios assignment
  group by assignment.instructor_id, assignment.lesson_id
), schedule_stats as (
  select occurrence.instructor_id, occurrence.store_id,
    count(*)::integer as occurrence_count
  from public.feelcycle_schedule_occurrences occurrence
  group by occurrence.instructor_id, occurrence.store_id
), schedule_totals as (
  select occurrence.instructor_id,
    count(*)::integer as scheduled_count,
    count(distinct occurrence.lesson_date)::integer as active_days
  from public.feelcycle_schedule_occurrences occurrence
  group by occurrence.instructor_id
), current_studios as (
  select assignment.instructor_id,
    jsonb_agg(jsonb_build_object(
      'id', studio.id, 'name', studio.studio_name, 'code', studio.studio_code,
      'count', coalesce(schedule.occurrence_count, 0)
    ) order by studio.studio_name) as studios,
    array_agg(studio.studio_code order by studio.studio_code) as studio_codes
  from public.feelcycle_instructor_studios assignment
  join public.feelcycle_studios studio on studio.id = assignment.store_id
  left join schedule_stats schedule on schedule.instructor_id = assignment.instructor_id
    and schedule.store_id = assignment.store_id
  group by assignment.instructor_id
)
select instructor.id, instructor.instructor_name, instructor.profile_image_url,
  coalesce(history.first_taught_on, instructor.first_observed_at::date) as first_taught_on,
  history.last_taught_on,
  coalesce(history.occurrence_count, 0)::integer as occurrence_count,
  (select count(*)::integer from program_stats stat where stat.instructor_id = instructor.id) as program_count,
  current.studios, current.studio_codes,
  coalesce(schedule.scheduled_count, 0)::integer as scheduled_count,
  coalesce(schedule.active_days, 0)::integer as active_days,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ranked.id, 'name', ranked.name, 'count', ranked.occurrence_count
    ) order by ranked.last_taught_on desc, ranked.occurrence_count desc)
    from (
      select lesson.id, lesson.lesson_name as name,
        stat.occurrence_count, stat.last_taught_on
      from program_stats stat
      join public.feelcycle_lessons lesson on lesson.id = stat.lesson_id
      where stat.instructor_id = instructor.id
      order by stat.last_taught_on desc, stat.occurrence_count desc
      limit 4
    ) ranked
  ), '[]'::jsonb) as top_programs,
  lower(concat_ws(' ', instructor.instructor_name,
    (select string_agg(lesson.lesson_name, ' ' order by lesson.lesson_name)
      from program_stats stat
      join public.feelcycle_lessons lesson on lesson.id = stat.lesson_id
      where stat.instructor_id = instructor.id)
  )) as search_text
from current_studios current
join public.feelcycle_instructors instructor on instructor.id = current.instructor_id
left join history_totals history on history.instructor_id = instructor.id
left join schedule_totals schedule on schedule.instructor_id = instructor.id;

create unique index feelcycle_instructor_catalogue_summary_id_idx
  on public.feelcycle_instructor_catalogue_summary (id);

grant select on public.feelcycle_program_catalogue_summary to service_role;
grant select on public.feelcycle_instructor_catalogue_summary to service_role;

create index if not exists feelcycle_schedule_occurrences_date_start_idx
  on public.feelcycle_schedule_occurrences (lesson_date, lesson_start);
create index if not exists feelcycle_schedule_occurrences_lesson_schedule_idx
  on public.feelcycle_schedule_occurrences (lesson_id, lesson_date, lesson_start);
create index if not exists feelcycle_schedule_occurrences_instructor_schedule_idx
  on public.feelcycle_schedule_occurrences (instructor_id, lesson_date, lesson_start);

create or replace function public.refresh_feelcycle_catalogue_summaries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.feelcycle_program_catalogue_summary;
  refresh materialized view public.feelcycle_instructor_catalogue_summary;
end;
$$;

revoke all on function public.refresh_feelcycle_catalogue_summaries() from public;
grant execute on function public.refresh_feelcycle_catalogue_summaries() to service_role;

comment on materialized view public.feelcycle_program_catalogue_summary is
  'Precomputed lightweight rows for the Programs listing and search page.';
comment on materialized view public.feelcycle_instructor_catalogue_summary is
  'Precomputed lightweight rows for the current Instructor listing and search page.';
