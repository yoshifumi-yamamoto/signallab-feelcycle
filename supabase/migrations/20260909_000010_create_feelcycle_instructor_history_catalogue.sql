create or replace view public.feelcycle_instructor_history_catalogue
with (security_invoker = true)
as
with program_stats as (
  select instructor_id, lesson_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by instructor_id, lesson_id
), studio_stats as (
  select instructor_id, store_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by instructor_id, store_id
), totals as (
  select instructor_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by instructor_id
)
select instructor.id, instructor.instructor_name, instructor.profile_image_url,
  total.first_taught_on, total.last_taught_on, total.occurrence_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lesson.id,
      'name', lesson.lesson_name,
      'count', stat.occurrence_count,
      'firstTaughtOn', stat.first_taught_on,
      'lastTaughtOn', stat.last_taught_on
    ) order by stat.last_taught_on desc, stat.occurrence_count desc)
    from program_stats stat
    join public.feelcycle_lessons lesson on lesson.id = stat.lesson_id
    where stat.instructor_id = instructor.id
  ), '[]'::jsonb) as programs,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', studio.id,
      'name', studio.studio_name,
      'code', studio.studio_code,
      'count', stat.occurrence_count,
      'firstTaughtOn', stat.first_taught_on,
      'lastTaughtOn', stat.last_taught_on
    ) order by stat.last_taught_on desc, stat.occurrence_count desc)
    from studio_stats stat
    join public.feelcycle_studios studio on studio.id = stat.store_id
    where stat.instructor_id = instructor.id
  ), '[]'::jsonb) as studios
from totals total
join public.feelcycle_instructors instructor on instructor.id = total.instructor_id;

comment on view public.feelcycle_instructor_history_catalogue is
  'One row per instructor with five-year program and studio teaching aggregates for efficient catalogue pages.';
