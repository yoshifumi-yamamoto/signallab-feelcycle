with ranked as (
  select
    id,
    row_number() over (
      partition by workout_date, start_time, studio, program
      order by updated_at desc, created_at desc, id desc
    ) as row_num
  from public.feelcycle_workouts
)
delete from public.feelcycle_workouts target
using ranked
where target.id = ranked.id
  and ranked.row_num > 1;
