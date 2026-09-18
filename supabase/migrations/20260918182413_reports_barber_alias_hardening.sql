create or replace function public.get_report_barbers(
  p_shop uuid,p_from date,p_to date,p_barber_id uuid default null
)
returns table(barber_id uuid,barber_name text,appointment_count bigint,completed_count bigint,cancelled_count bigint,no_show_count bigint,booked_minutes numeric,capacity_minutes numeric,occupancy_percent numeric,estimated_revenue_cents bigint,rating_avg numeric,rating_count bigint)
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
  with appt_rows as (
    select a.barber_id row_barber_id,count(*)::bigint appointment_count_value,count(*) filter(where a.status='completed')::bigint completed_count_value,count(*) filter(where a.status='cancelled')::bigint cancelled_count_value,count(*) filter(where a.status='no_show')::bigint no_show_count_value,
      coalesce(sum(a.duration_min) filter(where a.status<>'cancelled'),0)::numeric booked_minutes_value,
      coalesce(sum(a.price_cents) filter(where a.status='completed'),0)::bigint estimated_revenue_cents_value
    from public.appointments a
    where a.barbershop_id=p_shop and a.starts_at>=(p_from::timestamp at time zone v_tz) and a.starts_at<((p_to+1)::timestamp at time zone v_tz)
      and (v_barber is null or a.barber_id=v_barber) group by a.barber_id
  ), cap_rows as (
    select rc.barber_id row_barber_id,sum(rc.capacity_minutes)::numeric capacity_minutes_value
    from private.report_capacity_by_day(p_shop,p_from,p_to,v_barber) rc group by rc.barber_id
  )
  select b.id,b.display_name,coalesce(ar.appointment_count_value,0),coalesce(ar.completed_count_value,0),coalesce(ar.cancelled_count_value,0),coalesce(ar.no_show_count_value,0),coalesce(ar.booked_minutes_value,0),coalesce(cr.capacity_minutes_value,0),
    case when coalesce(cr.capacity_minutes_value,0)>0 then round(coalesce(ar.booked_minutes_value,0)/cr.capacity_minutes_value*100,2) else 0 end,
    coalesce(ar.estimated_revenue_cents_value,0),b.rating_avg,b.rating_count::bigint
  from public.barbers b left join appt_rows ar on ar.row_barber_id=b.id left join cap_rows cr on cr.row_barber_id=b.id
  where b.barbershop_id=p_shop and (v_barber is null or b.id=v_barber) and (b.is_active or coalesce(ar.appointment_count_value,0)>0)
  order by coalesce(ar.estimated_revenue_cents_value,0) desc,b.sort_order,b.display_name;
end $$;
revoke all on function public.get_report_barbers(uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_report_barbers(uuid,date,date,uuid) to authenticated;