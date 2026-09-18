create or replace function public.get_report_summary(
  p_shop uuid,p_from date,p_to date,p_barber_id uuid default null
)
returns table(from_date date,to_date date,appointment_count bigint,pending_count bigint,confirmed_count bigint,in_progress_count bigint,completed_count bigint,cancelled_count bigint,no_show_count bigint,booked_minutes numeric,capacity_minutes numeric,occupancy_percent numeric,estimated_revenue_cents bigint,paid_deposit_cents bigint,refunded_deposit_cents bigint,average_completed_ticket_cents numeric,new_customers_count bigint)
language plpgsql security definer stable set search_path=''
as $$
declare v_tz text; v_barber uuid; v_from_ts timestamptz; v_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber:=private.resolve_report_barber(p_shop,p_barber_id);
  select s.timezone into v_tz from public.barbershops s where s.id=p_shop;
  if v_tz is null then raise exception 'SHOP_REQUIRED'; end if;
  v_from_ts:=p_from::timestamp at time zone v_tz;
  v_to_ts:=(p_to+1)::timestamp at time zone v_tz;
  return query
  with appts as (
    select a.* from public.appointments a
    where a.barbershop_id=p_shop and a.starts_at>=v_from_ts and a.starts_at<v_to_ts
      and (v_barber is null or a.barber_id=v_barber)
  ), metric_rows as (
    select count(*)::bigint appointment_count_value,
      count(*) filter(where a.status='pending')::bigint pending_count_value,
      count(*) filter(where a.status='confirmed')::bigint confirmed_count_value,
      count(*) filter(where a.status='in_progress')::bigint in_progress_count_value,
      count(*) filter(where a.status='completed')::bigint completed_count_value,
      count(*) filter(where a.status='cancelled')::bigint cancelled_count_value,
      count(*) filter(where a.status='no_show')::bigint no_show_count_value,
      coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric booked_minutes_value,
      coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint estimated_revenue_cents_value,
      coalesce(sum(a.deposit_cents) filter(where a.deposit_status='paid'),0)::bigint paid_deposit_cents_value,
      coalesce(sum(a.deposit_cents) filter(where a.deposit_status='refunded'),0)::bigint refunded_deposit_cents_value,
      coalesce(avg(a.price_cents) filter(where a.status='completed'),0)::numeric average_completed_ticket_cents_value
    from appts a
  ), capacity_rows as (
    select coalesce(sum(rc.capacity_minutes),0)::numeric capacity_minutes_value
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber) rc
  ), customer_rows as (
    select count(*)::bigint new_customers_count_value from public.customers c
    where c.barbershop_id=p_shop and c.created_at>=v_from_ts and c.created_at<v_to_ts
  )
  select p_from,p_to,mr.appointment_count_value,mr.pending_count_value,mr.confirmed_count_value,mr.in_progress_count_value,mr.completed_count_value,mr.cancelled_count_value,mr.no_show_count_value,mr.booked_minutes_value,cr.capacity_minutes_value,
    case when cr.capacity_minutes_value>0 then round((mr.booked_minutes_value/cr.capacity_minutes_value)*100,2) else 0 end,
    mr.estimated_revenue_cents_value,mr.paid_deposit_cents_value,mr.refunded_deposit_cents_value,round(mr.average_completed_ticket_cents_value,2),cu.new_customers_count_value
  from metric_rows mr cross join capacity_rows cr cross join customer_rows cu;
end $$;
revoke all on function public.get_report_summary(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_summary(uuid,date,date,uuid) to authenticated;