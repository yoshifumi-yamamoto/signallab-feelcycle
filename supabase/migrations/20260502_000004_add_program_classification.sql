alter table public.feelcycle_workouts
  add column if not exists raw_program_name text,
  add column if not exists lesson_kind text,
  add column if not exists program_family text,
  add column if not exists program_series text,
  add column if not exists program_variant text,
  add column if not exists program_version integer,
  add column if not exists parse_rule text,
  add column if not exists ticket_kind text,
  add column if not exists is_special_ticket boolean,
  add column if not exists special_ticket_label text,
  add column if not exists event_name text,
  add column if not exists event_notes text;

update public.feelcycle_workouts
set raw_program_name = program
where raw_program_name is null;

update public.feelcycle_workouts
set
  ticket_kind = coalesce(ticket_kind, 'regular'),
  is_special_ticket = coalesce(is_special_ticket, false);

with classified as (
  select
    id,
    program,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+' then 'regular'
      when program ~ '^FEEL NOW [BGS][0-9]+$' then 'regular'
      when program ~ '^L [0-9]{2} [A-Z]+( [0-9]+)?$' then 'regular'
      when program = 'SKRILLEX' then 'regular'
      when program ~ '^FEEL HIGH( [0-9]+)?$' then 'event'
      when program in ('BEERCYCLE', '10th SP') then 'event'
      else 'unknown'
    end as lesson_kind,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+' then 'standard'
      when program ~ '^FEEL NOW [BGS][0-9]+$' then 'feel_now'
      when program ~ '^L [0-9]{2} [A-Z]+( [0-9]+)?$' then 'luster'
      when program = 'SKRILLEX' then 'artist_series'
      when program ~ '^FEEL HIGH( [0-9]+)?$' then 'event'
      when program in ('BEERCYCLE', '10th SP') then 'event'
      else 'unknown'
    end as program_family,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+' then substring(program from '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)')
      when program ~ '^FEEL NOW [BGS][0-9]+$' then 'FEEL NOW'
      when program ~ '^L [0-9]{2} [A-Z]+( [0-9]+)?$' then 'LUSTER'
      when program = 'SKRILLEX' then 'SKRILLEX'
      when program ~ '^FEEL HIGH( [0-9]+)?$' then 'FEEL HIGH'
      when program in ('BEERCYCLE', '10th SP') then program
      else null
    end as program_series,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+' then trim(
        regexp_replace(
          regexp_replace(program, '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+', ''),
          '\s+[0-9]+$',
          ''
        )
      )
      when program ~ '^FEEL NOW [BGS][0-9]+$' then case substring(program from '^FEEL NOW ([BGS])')
        when 'B' then 'BLACK'
        when 'G' then 'GOLD'
        when 'S' then 'SILVER'
        else null
      end
      when program ~ '^L [0-9]{2} [A-Z]+( [0-9]+)?$' then substring(program from '^L [0-9]{2} ([A-Z]+)')
      else null
    end as program_variant,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+.+\s+([0-9]+)$' then substring(program from '([0-9]+)$')::integer
      when program ~ '^FEEL NOW [BGS]([0-9]+)$' then substring(program from '^FEEL NOW [BGS]([0-9]+)$')::integer
      when program ~ '^L ([0-9]{2}) [A-Z]+( [0-9]+)?$' then substring(program from '^L ([0-9]{2})')::integer
      when program ~ '^FEEL HIGH ([0-9]+)$' then substring(program from '^FEEL HIGH ([0-9]+)$')::integer
      else null
    end as program_version,
    case
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+.+\s+[0-9]+$' then 'standard_series_theme_version'
      when program ~ '^(BSBi|BSWi|BB1|BB2|BB3|BSB|BSW|BSL)\s+' then 'standard_series_theme_only'
      when program ~ '^FEEL NOW [BGS][0-9]+$' then 'feel_now_variant_cycle'
      when program ~ '^L [0-9]{2} [A-Z]+ [0-9]+$' then 'luster_edition_variant_version'
      when program ~ '^L [0-9]{2} [A-Z]+$' then 'luster_edition_variant'
      when program = 'SKRILLEX' then 'artist_series_literal'
      when program ~ '^FEEL HIGH( [0-9]+)?$' then 'event_series_version'
      when program in ('BEERCYCLE', '10th SP') then 'event_literal'
      else 'unclassified'
    end as parse_rule
  from public.feelcycle_workouts
)
update public.feelcycle_workouts target
set
  lesson_kind = classified.lesson_kind,
  program_family = classified.program_family,
  program_series = classified.program_series,
  program_variant = classified.program_variant,
  program_version = classified.program_version,
  parse_rule = classified.parse_rule
from classified
where target.id = classified.id;

alter table public.feelcycle_workouts
  alter column raw_program_name set not null,
  alter column lesson_kind set not null,
  alter column program_family set not null,
  alter column parse_rule set not null,
  alter column ticket_kind set not null,
  alter column is_special_ticket set not null;

create index if not exists feelcycle_workouts_program_family_idx
  on public.feelcycle_workouts (program_family);

create index if not exists feelcycle_workouts_program_series_idx
  on public.feelcycle_workouts (program_series);

create index if not exists feelcycle_workouts_lesson_kind_idx
  on public.feelcycle_workouts (lesson_kind);

create index if not exists feelcycle_workouts_ticket_kind_idx
  on public.feelcycle_workouts (ticket_kind);

comment on column public.feelcycle_workouts.raw_program_name is
  'Original program label captured from FEELCYCLE before structured parsing.';

comment on column public.feelcycle_workouts.lesson_kind is
  'High-level lesson type such as regular, event, or unknown.';

comment on column public.feelcycle_workouts.program_family is
  'Program taxonomy family: standard, feel_now, luster, artist_series, event, or unknown.';

comment on column public.feelcycle_workouts.program_series is
  'Primary series label such as BB2, FEEL NOW, LUSTER, or SKRILLEX.';

comment on column public.feelcycle_workouts.program_variant is
  'Sub-series label such as House, BLACK, FEEL, or BTM.';

comment on column public.feelcycle_workouts.program_version is
  'Numeric version or edition number when present.';

comment on column public.feelcycle_workouts.parse_rule is
  'Parser rule used to classify the raw program name.';

comment on column public.feelcycle_workouts.ticket_kind is
  'Ticket requirement for this workout instance, such as regular, event_ticket, additional_ticket, or other.';

comment on column public.feelcycle_workouts.is_special_ticket is
  'Whether this workout required a special paid ticket beyond the regular plan.';

comment on column public.feelcycle_workouts.special_ticket_label is
  'Original ticket label captured from the schedule UI, such as イベントチケット or Add Ticket.';

comment on column public.feelcycle_workouts.event_name is
  'Optional event name when the workout instance belongs to a named event campaign.';

comment on column public.feelcycle_workouts.event_notes is
  'Optional freeform note for event or special-ticket context.';
