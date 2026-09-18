create or replace function private.report_capacity_by_day(
  p_shop uuid,p_from date,p_to date,p_barber_id uuid default null
)
returns table(report_date date,barber_id uuid,capacity_minutes numeric)
language plpgsql security definer stable set search_path=''
as $$
declare v_tz text; v_barber uuid;
begin
  if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber:=private.resolve_report_barber(p_shop,p_barber_id);
  select s.timezone into v_tz from public.barbershops s where s.id=p_shop;
  if v_tz is null then raise exception 'SHOP_REQUIRED'; end if;
  return query
  with days as (select generate_series(p_from,p_to,interval '1 day')::date day),
  barber_base as (
    select b.id report_barber_id,b.sort_order from public.barbers b
    where b.barbershop_id=p_shop and ((v_barber is null and b.is_active) or b.id=v_barber)
  ), schedule as (
    select d.day,bb.report_barber_id,
      case when ov.id is not null then ov.opens_at else wh.opens_at end opens_at,
      case when ov.id is not null then ov.closes_at else wh.closes_at end closes_at,
      case when ov.id is not null then ov.is_closed when wh.id is null then true else wh.is_closed end is_closed
    from days d cross join barber_base bb
    left join lateral (
      select o.id,o.is_closed,o.opens_at,o.closes_at from public.schedule_overrides o
      where o.barbershop_id=p_shop and o.override_date=d.day and (o.barber_id=bb.report_barber_id or o.barber_id is null)
      order by case when o.barber_id=bb.report_barber_id then 0 else 1 end limit 1
    ) ov on true
    left join lateral (
      select w.id,w.opens_at,w.closes_at,w.is_closed from public.working_hours w
      where w.barbershop_id=p_shop and w.weekday=extract(dow from d.day)::int and (w.barber_id=bb.report_barber_id or w.barber_id is null)
      order by case when w.barber_id=bb.report_barber_id then 0 else 1 end limit 1
    ) wh on true
  ), open_schedule as (
    select sc.day schedule_day,sc.report_barber_id,
      ((sc.day::timestamp+sc.opens_at) at time zone v_tz) open_ts,
      ((sc.day::timestamp+sc.closes_at) at time zone v_tz) close_ts
    from schedule sc where not sc.is_closed and sc.opens_at is not null and sc.closes_at is not null and sc.closes_at>sc.opens_at
  ), raw_blocks as (
    select os.schedule_day,os.report_barber_id,greatest(tb.starts_at,os.open_ts) starts_at,least(tb.ends_at,os.close_ts) ends_at
    from open_schedule os join public.time_blocks tb
      on tb.barbershop_id=p_shop and (tb.barber_id=os.report_barber_id or tb.barber_id is null)
      and tb.starts_at<os.close_ts and tb.ends_at>os.open_ts
  ), ordered_blocks as (
    select rb.schedule_day,rb.report_barber_id,rb.starts_at,rb.ends_at,
      max(rb.ends_at) over(partition by rb.schedule_day,rb.report_barber_id order by rb.starts_at,rb.ends_at rows between unbounded preceding and 1 preceding) prev_max_end
    from raw_blocks rb where rb.starts_at<rb.ends_at
  ), marked_blocks as (
    select ob.*,sum(case when ob.prev_max_end is null or ob.starts_at>ob.prev_max_end then 1 else 0 end)
      over(partition by ob.schedule_day,ob.report_barber_id order by ob.starts_at,ob.ends_at rows unbounded preceding) grp
    from ordered_blocks ob
  ), merged_blocks as (
    select mb.schedule_day,mb.report_barber_id,min(mb.starts_at) starts_at,max(mb.ends_at) ends_at
    from marked_blocks mb group by mb.schedule_day,mb.report_barber_id,mb.grp
  ), blocked as (
    select mb.schedule_day,mb.report_barber_id,sum(extract(epoch from (mb.ends_at-mb.starts_at))/60.0) blocked_minutes_value
    from merged_blocks mb group by mb.schedule_day,mb.report_barber_id
  )
  select os.schedule_day,os.report_barber_id,greatest(0::numeric,round(extract(epoch from(os.close_ts-os.open_ts))/60.0-coalesce(b.blocked_minutes_value,0),2))
  from open_schedule os left join blocked b on b.schedule_day=os.schedule_day and b.report_barber_id=os.report_barber_id
  order by os.schedule_day,os.report_barber_id;
end $$;
revoke all on function private.report_capacity_by_day(uuid,date,date,uuid) from public,anon,authenticated;