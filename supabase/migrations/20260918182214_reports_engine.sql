-- BarberOS Phase 18: production reporting read models.
-- Reports are tenant-scoped SECURITY DEFINER RPCs. No direct client reads of sensitive tables are introduced.

create or replace function private.resolve_report_barber(
  p_shop uuid,
  p_barber_id uuid default null
)
returns uuid
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_barber_id uuid := p_barber_id;
begin
  perform private.require_agenda_access(p_shop);

  if v_barber_id is not null and not exists (
    select 1 from public.barbers b
    where b.id=v_barber_id and b.barbershop_id=p_shop
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  if private.is_member(p_shop,array['barber']::public.app_role[]) then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  return v_barber_id;
end;
$$;

revoke all on function private.resolve_report_barber(uuid,uuid) from public,anon,authenticated;

create or replace function private.report_capacity_by_day(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  report_date date,
  barber_id uuid,
  capacity_minutes numeric
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to-p_from > 366 then
    raise exception 'REPORT_RANGE_TOO_LARGE';
  end if;

  v_barber := private.resolve_report_barber(p_shop,p_barber_id);

  select timezone into v_tz
  from public.barbershops
  where id=p_shop;

  if v_tz is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  return query
  with days as (
    select generate_series(p_from,p_to,interval '1 day')::date as day
  ),
  barber_base as (
    select b.id,b.sort_order
    from public.barbers b
    where b.barbershop_id=p_shop
      and (v_barber is null and b.is_active or b.id=v_barber)
  ),
  schedule as (
    select
      d.day,
      b.id as barber_id,
      case
        when ov.id is not null then ov.opens_at
        else wh.opens_at
      end as opens_at,
      case
        when ov.id is not null then ov.closes_at
        else wh.closes_at
      end as closes_at,
      case
        when ov.id is not null then ov.is_closed
        when wh.id is null then true
        else wh.is_closed
      end as is_closed
    from days d
    cross join barber_base b
    left join lateral (
      select o.id,o.is_closed,o.opens_at,o.closes_at
      from public.schedule_overrides o
      where o.barbershop_id=p_shop
        and o.override_date=d.day
        and (o.barber_id=b.id or o.barber_id is null)
      order by case when o.barber_id=b.id then 0 else 1 end
      limit 1
    ) ov on true
    left join lateral (
      select w.id,w.opens_at,w.closes_at,w.is_closed
      from public.working_hours w
      where w.barbershop_id=p_shop
        and w.weekday=extract(dow from d.day)::int
        and (w.barber_id=b.id or w.barber_id is null)
      order by case when w.barber_id=b.id then 0 else 1 end
      limit 1
    ) wh on true
  ),
  open_schedule as (
    select
      day,
      barber_id,
      ((day::timestamp + opens_at) at time zone v_tz) as open_ts,
      ((day::timestamp + closes_at) at time zone v_tz) as close_ts
    from schedule
    where not is_closed
      and opens_at is not null
      and closes_at is not null
      and closes_at > opens_at
  ),
  raw_blocks as (
    select
      s.day,
      s.barber_id,
      greatest(t.starts_at,s.open_ts) as starts_at,
      least(t.ends_at,s.close_ts) as ends_at
    from open_schedule s
    join public.time_blocks t
      on t.barbershop_id=p_shop
     and (t.barber_id=s.barber_id or t.barber_id is null)
     and t.starts_at < s.close_ts
     and t.ends_at > s.open_ts
  ),
  ordered_blocks as (
    select
      day,barber_id,starts_at,ends_at,
      max(ends_at) over (
        partition by day,barber_id
        order by starts_at,ends_at
        rows between unbounded preceding and 1 preceding
      ) as prev_max_end
    from raw_blocks
    where starts_at < ends_at
  ),
  marked_blocks as (
    select *,
      sum(
        case when prev_max_end is null or starts_at > prev_max_end then 1 else 0 end
      ) over (
        partition by day,barber_id
        order by starts_at,ends_at
        rows unbounded preceding
      ) as grp
    from ordered_blocks
  ),
  merged_blocks as (
    select day,barber_id,min(starts_at) as starts_at,max(ends_at) as ends_at
    from marked_blocks
    group by day,barber_id,grp
  ),
  blocked as (
    select
      day,
      barber_id,
      sum(extract(epoch from (ends_at-starts_at))/60.0) as blocked_minutes
    from merged_blocks
    group by day,barber_id
  )
  select
    s.day,
    s.barber_id,
    greatest(
      0::numeric,
      round(
        extract(epoch from (s.close_ts-s.open_ts))/60.0
        - coalesce(b.blocked_minutes,0),
        2
      )
    )
  from open_schedule s
  left join blocked b
    on b.day=s.day and b.barber_id=s.barber_id
  order by s.day,s.barber_id;
end;
$$;

revoke all on function private.report_capacity_by_day(uuid,date,date,uuid) from public,anon,authenticated;

create or replace function public.get_report_summary(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  from_date date,
  to_date date,
  appointment_count bigint,
  pending_count bigint,
  confirmed_count bigint,
  in_progress_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  booked_minutes numeric,
  capacity_minutes numeric,
  occupancy_percent numeric,
  estimated_revenue_cents bigint,
  paid_deposit_cents bigint,
  refunded_deposit_cents bigint,
  average_completed_ticket_cents numeric,
  new_customers_count bigint
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if p_to-p_from > 366 then
    raise exception 'REPORT_RANGE_TOO_LARGE';
  end if;

  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;
  if v_tz is null then raise exception 'SHOP_REQUIRED'; end if;

  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts := (p_to + 1)::timestamp at time zone v_tz;

  return query
  with appts as (
    select a.*
    from public.appointments a
    where a.barbershop_id=p_shop
      and a.starts_at >= v_from_ts
      and a.starts_at < v_to_ts
      and (v_barber is null or a.barber_id=v_barber)
  ),
  metrics as (
    select
      count(*)::bigint as appointment_count,
      count(*) filter(where status='pending')::bigint as pending_count,
      count(*) filter(where status='confirmed')::bigint as confirmed_count,
      count(*) filter(where status='in_progress')::bigint as in_progress_count,
      count(*) filter(where status='completed')::bigint as completed_count,
      count(*) filter(where status='cancelled')::bigint as cancelled_count,
      count(*) filter(where status='no_show')::bigint as no_show_count,
      coalesce(sum(duration_min) filter(where status <> 'cancelled'),0)::numeric as booked_minutes,
      coalesce(sum(price_cents) filter(where status='completed'),0)::bigint as estimated_revenue_cents,
      coalesce(sum(deposit_cents) filter(where deposit_status='paid'),0)::bigint as paid_deposit_cents,
      coalesce(sum(deposit_cents) filter(where deposit_status='refunded'),0)::bigint as refunded_deposit_cents,
      coalesce(avg(price_cents) filter(where status='completed'),0)::numeric as average_completed_ticket_cents
    from appts
  ),
  capacity as (
    select coalesce(sum(capacity_minutes),0)::numeric capacity_minutes
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber)
  ),
  customers as (
    select count(*)::bigint new_customers_count
    from public.customers c
    where c.barbershop_id=p_shop
      and c.created_at >= v_from_ts
      and c.created_at < v_to_ts
  )
  select
    p_from,
    p_to,
    m.appointment_count,
    m.pending_count,
    m.confirmed_count,
    m.in_progress_count,
    m.completed_count,
    m.cancelled_count,
    m.no_show_count,
    m.booked_minutes,
    c.capacity_minutes,
    case
      when c.capacity_minutes > 0
        then round((m.booked_minutes/c.capacity_minutes)*100,2)
      else 0
    end,
    m.estimated_revenue_cents,
    m.paid_deposit_cents,
    m.refunded_deposit_cents,
    round(m.average_completed_ticket_cents,2),
    customers.new_customers_count
  from metrics m cross join capacity c cross join customers;
end;
$$;

revoke all on function public.get_report_summary(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_summary(uuid,date,date,uuid) to authenticated;

create or replace function public.get_report_daily(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  report_date date,
  appointment_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  pending_count bigint,
  confirmed_count bigint,
  in_progress_count bigint,
  booked_minutes numeric,
  capacity_minutes numeric,
  occupancy_percent numeric,
  estimated_revenue_cents bigint,
  paid_deposit_cents bigint
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;

  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;

  return query
  with days as (
    select generate_series(p_from,p_to,interval '1 day')::date as day
  ),
  appts as (
    select a.*, (a.starts_at at time zone v_tz)::date local_day
    from public.appointments a
    where a.barbershop_id=p_shop
      and (v_barber is null or a.barber_id=v_barber)
      and a.starts_at >= (p_from::timestamp at time zone v_tz)
      and a.starts_at < ((p_to+1)::timestamp at time zone v_tz)
  ),
  daily as (
    select
      local_day,
      count(*)::bigint appointment_count,
      count(*) filter(where status='completed')::bigint completed_count,
      count(*) filter(where status='cancelled')::bigint cancelled_count,
      count(*) filter(where status='no_show')::bigint no_show_count,
      count(*) filter(where status='pending')::bigint pending_count,
      count(*) filter(where status='confirmed')::bigint confirmed_count,
      count(*) filter(where status='in_progress')::bigint in_progress_count,
      coalesce(sum(duration_min) filter(where status<>'cancelled'),0)::numeric booked_minutes,
      coalesce(sum(price_cents) filter(where status='completed'),0)::bigint estimated_revenue_cents,
      coalesce(sum(deposit_cents) filter(where deposit_status='paid'),0)::bigint paid_deposit_cents
    from appts
    group by local_day
  ),
  capacity as (
    select report_date,coalesce(sum(capacity_minutes),0)::numeric capacity_minutes
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber)
    group by report_date
  )
  select
    d.day,
    coalesce(x.appointment_count,0),
    coalesce(x.completed_count,0),
    coalesce(x.cancelled_count,0),
    coalesce(x.no_show_count,0),
    coalesce(x.pending_count,0),
    coalesce(x.confirmed_count,0),
    coalesce(x.in_progress_count,0),
    coalesce(x.booked_minutes,0),
    coalesce(c.capacity_minutes,0),
    case when coalesce(c.capacity_minutes,0)>0
      then round((coalesce(x.booked_minutes,0)/c.capacity_minutes)*100,2)
      else 0 end,
    coalesce(x.estimated_revenue_cents,0),
    coalesce(x.paid_deposit_cents,0)
  from days d
  left join daily x on x.local_day=d.day
  left join capacity c on c.report_date=d.day
  order by d.day;
end;
$$;

revoke all on function public.get_report_daily(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_daily(uuid,date,date,uuid) to authenticated;

create or replace function public.get_report_services(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  service_id uuid,
  service_name text,
  appointment_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  booked_minutes numeric,
  estimated_revenue_cents bigint,
  paid_deposit_cents bigint,
  average_completed_ticket_cents numeric
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;
  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts := (p_to+1)::timestamp at time zone v_tz;

  return query
  select
    s.id,
    s.name,
    count(a.id)::bigint,
    count(a.id) filter(where a.status='completed')::bigint,
    count(a.id) filter(where a.status='cancelled')::bigint,
    count(a.id) filter(where a.status='no_show')::bigint,
    coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric,
    coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint,
    coalesce(sum(a.deposit_cents) filter(where a.deposit_status='paid'),0)::bigint,
    round(coalesce(avg(a.price_cents) filter(where a.status='completed'),0),2)
  from public.services s
  left join public.appointments a
    on a.service_id=s.id
   and a.barbershop_id=p_shop
   and a.starts_at >= v_from_ts
   and a.starts_at < v_to_ts
   and (v_barber is null or a.barber_id=v_barber)
  where s.barbershop_id=p_shop
  group by s.id,s.name,s.sort_order
  order by coalesce(sum(a.price_cents) filter(where a.status='completed'),0) desc,s.sort_order,s.name;
end;
$$;

revoke all on function public.get_report_services(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_services(uuid,date,date,uuid) to authenticated;

create or replace function public.get_report_haircuts(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  haircut_id uuid,
  haircut_name text,
  appointment_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  booked_minutes numeric,
  estimated_revenue_cents bigint
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;
  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts := (p_to+1)::timestamp at time zone v_tz;

  return query
  with grouped as (
    select
      a.haircut_id,
      count(*)::bigint appointment_count,
      count(*) filter(where a.status='completed')::bigint completed_count,
      count(*) filter(where a.status='cancelled')::bigint cancelled_count,
      count(*) filter(where a.status='no_show')::bigint no_show_count,
      coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric booked_minutes,
      coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint estimated_revenue_cents
    from public.appointments a
    where a.barbershop_id=p_shop
      and a.starts_at >= v_from_ts
      and a.starts_at < v_to_ts
      and (v_barber is null or a.barber_id=v_barber)
    group by a.haircut_id
  )
  select
    g.haircut_id,
    case
      when g.haircut_id is null then 'Sem corte'
      else coalesce(h.name,'Corte removido')
    end,
    g.appointment_count,
    g.completed_count,
    g.cancelled_count,
    g.no_show_count,
    g.booked_minutes,
    g.estimated_revenue_cents
  from grouped g
  left join public.haircuts h on h.id=g.haircut_id
  order by g.estimated_revenue_cents desc,2;
end;
$$;

revoke all on function public.get_report_haircuts(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_haircuts(uuid,date,date,uuid) to authenticated;

create or replace function public.get_report_barbers(
  p_shop uuid,
  p_from date,
  p_to date,
  p_barber_id uuid default null
)
returns table(
  barber_id uuid,
  barber_name text,
  appointment_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  no_show_count bigint,
  booked_minutes numeric,
  capacity_minutes numeric,
  occupancy_percent numeric,
  estimated_revenue_cents bigint,
  rating_avg numeric,
  rating_count bigint
)
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_tz text;
  v_barber uuid;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;

  return query
  with appt as (
    select
      a.barber_id,
      count(*)::bigint appointment_count,
      count(*) filter(where a.status='completed')::bigint completed_count,
      count(*) filter(where a.status='cancelled')::bigint cancelled_count,
      count(*) filter(where a.status='no_show')::bigint no_show_count,
      coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric booked_minutes,
      coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint estimated_revenue_cents
    from public.appointments a
    where a.barbershop_id=p_shop
      and a.starts_at >= (p_from::timestamp at time zone v_tz)
      and a.starts_at < ((p_to+1)::timestamp at time zone v_tz)
      and (v_barber is null or a.barber_id=v_barber)
    group by a.barber_id
  ),
  cap as (
    select barber_id,sum(capacity_minutes)::numeric capacity_minutes
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber)
    group by barber_id
  )
  select
    b.id,
    b.display_name,
    coalesce(a.appointment_count,0),
    coalesce(a.completed_count,0),
    coalesce(a.cancelled_count,0),
    coalesce(a.no_show_count,0),
    coalesce(a.booked_minutes,0),
    coalesce(c.capacity_minutes,0),
    case when coalesce(c.capacity_minutes,0)>0
      then round(coalesce(a.booked_minutes,0)/c.capacity_minutes*100,2)
      else 0 end,
    coalesce(a.estimated_revenue_cents,0),
    b.rating_avg,
    b.rating_count::bigint
  from public.barbers b
  left join appt a on a.barber_id=b.id
  left join cap c on c.barber_id=b.id
  where b.barbershop_id=p_shop
    and (v_barber is null or b.id=v_barber)
    and (b.is_active or coalesce(a.appointment_count,0)>0)
  order by coalesce(a.estimated_revenue_cents,0) desc,b.sort_order,b.display_name;
end;
$$;

revoke all on function public.get_report_barbers(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_barbers(uuid,date,date,uuid) to authenticated;

comment on function public.get_report_summary(uuid,date,date,uuid) is 'Tenant-scoped reporting summary. Estimated revenue is completed appointment value; occupancy is booked non-cancelled minutes divided by configured working capacity after time blocks.';
comment on function public.get_report_daily(uuid,date,date,uuid) is 'Daily reporting series in the shop timezone.';
comment on function public.get_report_services(uuid,date,date,uuid) is 'Service performance reporting, including completed revenue estimate.';
comment on function public.get_report_haircuts(uuid,date,date,uuid) is 'Haircut performance reporting, including appointments and estimated completed revenue.';
comment on function public.get_report_barbers(uuid,date,date,uuid) is 'Barber performance reporting with capacity, occupancy and revenue estimate.';
