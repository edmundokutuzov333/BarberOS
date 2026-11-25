-- Minimum preparation gap between active appointments for the same barber.
alter table public.barbershops add column service_buffer_min integer not null default 0 check (service_buffer_min between 0 and 120);
grant select(service_buffer_min),update(service_buffer_min) on public.barbershops to authenticated;
CREATE OR REPLACE FUNCTION private.available_slots_for_duration(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_duration_min integer, p_exclude_appointment uuid)
 RETURNS TABLE(slot_start timestamp with time zone, barber_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  v_dur int;
  v_step int;
  v_lead int;
  v_tz text;
  v_today date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_tz := v_shop.timezone;
  v_today := (now() at time zone v_tz)::date;

  if p_date is null then
    raise exception 'INVALID_DATE';
  end if;

  if p_date < v_today then
    return;
  end if;

  if p_date > v_today + v_shop.max_advance_days then
    return;
  end if;

  select s.duration_min into v_dur
  from public.services s
  where s.id=p_service_id
    and s.barbershop_id=v_shop.id
    and s.is_active;

  if not found or v_dur < 5 or v_dur > 480 then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  v_dur := coalesce(p_duration_min,v_dur);
  if v_dur not between 5 and 480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
  v_step := v_shop.slot_interval_min;
  v_lead := v_shop.min_lead_time_min;

  if v_step not in (5,10,15,20,30,60) then
    raise exception 'INVALID_SLOT_INTERVAL';
  end if;

  if p_barber_id is not null and not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=v_shop.id
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  return query
  with candidates as (
    select b.id
    from public.barbers b
    join public.barber_services bs
      on bs.barber_id=b.id
     and bs.service_id=p_service_id
    where b.barbershop_id=v_shop.id
      and b.is_active
      and (p_barber_id is null or b.id=p_barber_id)
  ),
  schedule_choice as (
    select
      c.id as barber_id,
      o.id as override_id,
      o.is_closed as override_closed,
      o.opens_at as override_opens_at,
      o.closes_at as override_closes_at,
      bw.opens_at as barber_opens_at,
      bw.closes_at as barber_closes_at,
      bw.is_closed as barber_closed,
      sw.opens_at as shop_opens_at,
      sw.closes_at as shop_closes_at,
      sw.is_closed as shop_closed
    from candidates c
    left join lateral (
      select so.*
      from public.schedule_overrides so
      where so.barbershop_id=v_shop.id
        and so.override_date=p_date
        and (so.barber_id=c.id or so.barber_id is null)
      order by (so.barber_id is not null) desc
      limit 1
    ) o on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id=c.id
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) bw on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id is null
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) sw on true
  ),
  effective_windows as (
    select
      barber_id,
      case
        when override_id is not null then
          case when override_closed then null::time else override_opens_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_opens_at end
        else
          case when shop_closed then null::time else shop_opens_at end
      end as opens_at,
      case
        when override_id is not null then
          case when override_closed then null::time else override_closes_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_closes_at end
        else
          case when shop_closed then null::time else shop_closes_at end
      end as closes_at
    from schedule_choice
  ),
  valid_windows as (
    select
      barber_id,
      ((p_date::timestamp + opens_at) at time zone v_tz) as win_start,
      ((p_date::timestamp + closes_at) at time zone v_tz) as win_end
    from effective_windows
    where opens_at is not null
      and closes_at is not null
      and closes_at > opens_at
  ),
  grid as (
    select
      w.barber_id,
      gs as s,
      gs + make_interval(mins=>v_dur) as e
    from valid_windows w
    cross join lateral generate_series(
      w.win_start,
      w.win_end - make_interval(mins=>v_dur),
      make_interval(mins=>v_step)
    ) gs
  ),
  free_slots as (
    select g.barber_id,g.s
    from grid g
    where g.s >= now() + make_interval(mins=>v_lead)
      and g.s <= now() + make_interval(days=>v_shop.max_advance_days)
      and not exists (
        select 1
        from public.appointments a
        where a.barber_id=g.barber_id
          and a.id is distinct from p_exclude_appointment
          and (
            a.status in ('confirmed','in_progress')
            or (
              a.status='pending'
              and (a.hold_expires_at is null or a.hold_expires_at > now())
            )
          )
          and tstzrange(a.starts_at,a.ends_at+make_interval(mins=>v_shop.service_buffer_min),'[)') && tstzrange(g.s,g.e+make_interval(mins=>v_shop.service_buffer_min),'[)')
      )
      and not exists (
        select 1 from public.working_hours pause
        where pause.barbershop_id=v_shop.id
          and pause.weekday=extract(dow from p_date)::int
          and (pause.barber_id is null or pause.barber_id=g.barber_id)
          and not pause.is_closed and pause.break_start is not null
          and tstzrange((p_date+pause.break_start) at time zone v_tz,
                        (p_date+pause.break_end) at time zone v_tz,'[)') && tstzrange(g.s,g.e,'[)')
      )
      and not exists (
        select 1
        from public.time_blocks tb
        where tb.barbershop_id=v_shop.id
          and (tb.barber_id is null or tb.barber_id=g.barber_id)
          and tb.ends_at > tb.starts_at
          and tstzrange(tb.starts_at,tb.ends_at,'[)') && tstzrange(g.s,g.e,'[)')
      )
  )
  select fs.s, array_agg(fs.barber_id order by fs.barber_id)
  from free_slots fs
  group by fs.s
  order by fs.s;
end
$function$
;
