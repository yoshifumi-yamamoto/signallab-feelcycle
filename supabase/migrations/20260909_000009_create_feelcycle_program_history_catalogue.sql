create or replace view public.feelcycle_program_history_catalogue
with (security_invoker = true)
as
with instructor_stats as (
  select lesson_id, instructor_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by lesson_id, instructor_id
), studio_stats as (
  select lesson_id, store_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by lesson_id, store_id
), totals as (
  select lesson_id, min(first_taught_on) as first_taught_on,
    max(last_taught_on) as last_taught_on, sum(occurrence_count)::integer as occurrence_count
  from public.feelcycle_lesson_instructor_studios
  group by lesson_id
)
select lesson.id, lesson.lesson_name, lesson.program_family, lesson.program_series,
  lesson.program_variant, total.first_taught_on, total.last_taught_on,
  total.occurrence_count,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', instructor.id,
      'name', instructor.instructor_name,
      'count', stat.occurrence_count,
      'firstTaughtOn', stat.first_taught_on,
      'lastTaughtOn', stat.last_taught_on
    ) order by stat.last_taught_on desc, stat.occurrence_count desc)
    from instructor_stats stat
    join public.feelcycle_instructors instructor on instructor.id = stat.instructor_id
    where stat.lesson_id = lesson.id
  ), '[]'::jsonb) as instructors,
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
    where stat.lesson_id = lesson.id
  ), '[]'::jsonb) as studios
from totals total
join public.feelcycle_lessons lesson on lesson.id = total.lesson_id;

comment on view public.feelcycle_program_history_catalogue is
  'One row per program with five-year instructor and studio teaching aggregates for efficient catalogue pages.';
