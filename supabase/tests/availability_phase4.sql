-- BarberOS Phase 4: availability engine acceptance
with baseline as (
  select
    s.id as service_id,
    s.barbershop_id,
    sh.slug,
    b.id as barber_id
  from public.services s
  join public.barbershops sh on sh.id=s.barbershop_id
  join public.barber_services bs on bs.service_id=s.id
  join public.barbers b on b.id=bs.barber_id and b.barbershop_id=s.barbershop_id
  where sh.status in ('active','trial')
    and s.is_active
    and b.is_active
    and sh.max_advance_days >= 14
  order by sh.id, s.sort_order, b.sort_order
  limit 1
),
test_day as (
  select b.*,
         (
           select min(d)::date
           from generate_series(
             ((now() at time zone (select timezone from public.barbershops where id=b.barbershop_id))::date + 1),
             ((now() at time zone (select timezone from public.barbershops where id=b.barbershop_id))::date + 14),
             interval '1 day'
           ) d
           where exists (
             select 1
             from public.working_hours wh
             where wh.barbershop_id=b.barbershop_id
               and wh.barber_id is null
               and wh.weekday=extract(dow from d)::int
               and not wh.is_closed
           )
         ) as d
  from baseline b
),
checks(name,ok) as (
  select 'baseline_fixture', exists(select 1 from test_day),
  union all
  select 'baseline_slots_functional',
    exists(
      select 1
      from test_day t
      cross join lateral public.get_available_slots(t.slug,t.service_id,t.barber_id,t.d) s
    ),
  union all
  select 'schedule_override_table',
    to_regclass('public.schedule_overrides') is not null,
  union all
  select 'working_hours_interval_constraint',
    exists(select 1 from pg_constraint where conrelid='public.working_hours'::regclass and conname='working_hours_interval_valid'),
  union all
  select 'time_blocks_interval_constraint',
    exists(select 1 from pg_constraint where conrelid='public.time_blocks'::regclass and conname='time_blocks_interval_valid'),
  union all
  select 'availability_security',
    has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','execute')
    and has_function_privilege('anon','public.get_available_days(text,uuid,uuid,date,date)','execute')
)
select bool_and(ok) as passed,
       coalesce(string_agg(name, ', ' order by name) filter(where not ok),'') as failures
from checks;

do $$
declare
  v_slug text;
  v_service uuid;
  v_shop uuid;
  v_barber uuid;
  v_day date;
  v_base int;
  v_after_closed int;
  v_after_open int;
  v_test_service uuid;
  v_override uuid;
  v_slot timestamptz;
begin
  select slug,service_id,barbershop_id,barber_id,d
    into v_slug,v_service,v_shop,v_barber,v_day
  from test_day;

  if v_slug is null then
    raise exception 'NO_AVAILABILITY_FIXTURE';
  end if;

  select count(*) into v_base
  from public.get_available_slots(v_slug,v_service,v_barber,v_day);

  if v_base=0 then
    raise exception 'NO_BASE_SLOT_FOR_BEHAVIOUR_TEST';
  end if;

  begin
    select public.save_schedule_override(
      v_shop,v_day,null,true,null,null,'holiday','Phase 4 rollback',null
    ) into v_override;

    select count(*) into v_after_closed
    from public.get_available_slots(v_slug,v_service,v_barber,v_day);

    if v_after_closed<>0 then
      raise exception 'SHOP_CLOSED_OVERRIDE_FAILED';
    end if;

    select public.save_schedule_override(
      v_shop,v_day,v_barber,false,'09:00','18:00','other','Phase 4 barber exception',v_override
    ) into v_override;

    select count(*) into v_after_open
    from public.get_available_slots(v_slug,v_service,v_barber,v_day);

    if v_after_open=0 then
      raise exception 'BARBER_OVERRIDE_PRECEDENCE_FAILED';
    end if;

    raise exception 'ROLLBACK_SCHEDULE';
  exception when others then
    if sqlerrm <> 'ROLLBACK_SCHEDULE' then raise; end if;
  end;

  begin
    insert into public.services(barbershop_id,name,price_cents,duration_min,sort_order)
    values(v_shop,'Phase 4 Test Service',100,40,999)
    returning id into v_test_service;

    insert into public.barber_services(barber_id,service_id)
    values(v_barber,v_test_service);

    perform public.save_schedule_override(
      v_shop,v_day,v_barber,false,'10:00','12:00','other','40min interval acceptance',null
    );

    select slot_start into v_slot
    from public.get_available_slots(v_slug,v_test_service,v_barber,v_day)
    order by slot_start
    limit 1;

    if v_slot is null then
      raise exception 'FORTY_MIN_SLOT_MISSING';
    end if;

    if exists (
      select 1
      from public.get_available_slots(v_slug,v_test_service,v_barber,v_day)
      where slot_start = v_slot + interval '15 minutes'
         or slot_start = v_slot + interval '30 minutes'
    ) then
      raise exception 'FORTY_MINUTE_OVERLAP_GRID_FAILED';
    end if;

    raise exception 'ROLLBACK_40MIN';
  exception when others then
    if sqlerrm <> 'ROLLBACK_40MIN' then raise; end if;
  end;

  raise notice 'PASS | Phase 4 behavioural checks | date override precedence and 40-minute service overlap grid verified in rollback-only subtransactions';
end
$$;
