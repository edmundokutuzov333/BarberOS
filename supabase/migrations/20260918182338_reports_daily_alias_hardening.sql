create or replace function public.get_report_daily(
  p_shop uuid,p_from date,p_to date,p_barber_id uuid default null
)
returns table(report_date date,appointment_count bigint,completed_count bigint,cancelled_count bigint,no_show_count bigint,pending_count bigint,confirmed_count bigint,in_progress_count bigint,booked_minutes numeric,capacity_minutes numeric,occupancy_percent numeric,estimated_revenue_cents bigint,paid_deposit_cents bigint)
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
  appts as (
    select a.*,(a.starts_at at time zone v_tz)::date local_day from public.appointments a
    where a.barbershop_id=p_shop and (v_barber is null or a.barber_id=v_barber)
      and a.starts_at>=(p_from::timestamp at time zone v_tz) and a.starts_at<((p_to+1)::timestamp at time zone v_tz)
  ), daily_rows as (
    select a.local_day day_key,count(*)::bigint appointment_count_value,
      count(*) filter(where a.status='completed')::bigint completed_count_value,
      count(*) filter(where a.status='cancelled')::bigint cancelled_count_value,
      count(*) filter(where a.status='no_show')::bigint no_show_count_value,
      count(*) filter(where a.status='pending')::bigint pending_count_value,
      count(*) filter(where a.status='confirmed')::bigint confirmed_count_value,
      count(*) filter(where a.status='in_progress')::bigint in_progress_count_value,
      coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric booked_minutes_value,
      coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint estimated_revenue_cents_value,
      coalesce(sum(a.deposit_cents) filter(where a.deposit_status='paid'),0)::bigint paid_deposit_cents_value
    from appts a group by a.local_day
  ), capacity_rows as (
    select rc.report_date day_key,coalesce(sum(rc.capacity_minutes),0)::numeric capacity_minutes_value
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber) rc group by rc.report_date
  )
  select d.day,coalesce(dr.appointment_count_value,0),coalesce(dr.completed_count_value,0),coalesce(dr.cancelled_count_value,0),coalesce(dr.no_show_count_value,0),coalesce(dr.pending_count_value,0),coalesce(dr.confirmed_count_value,0),coalesce(dr.in_progress_count_value,0),coalesce(dr.booked_minutes_value,0),coalesce(cr.capacity_minutes_value,0),
    case when coalesce(cr.capacity_minutes_value,0)>0 then round((coalesce(dr.booked_minutes_value,0)/cr.capacity_minutes_value)*100,2) else 0 end,
    coalesce(dr.estimated_revenue_cents_value,0),coalesce(dr.paid_deposit_cents_value,0)
  from days d left join daily_rows dr on dr.day_key=d.day left join capacity_rows cr on cr.day_key=d.day order by d.day;
end $$;
revoke all on function public.get_report_daily(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_daily(uuid,date,date,uuid) to authenticated;