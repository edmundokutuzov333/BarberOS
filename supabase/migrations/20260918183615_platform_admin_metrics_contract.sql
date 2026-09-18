-- Phase 19 hardening: platform metrics aggregation.
create or replace function public.admin_get_metrics(p_from date,p_to date)
returns jsonb language plpgsql security definer stable set search_path=''
as $$
declare v_tz text:='Africa/Maputo'; v_from_ts timestamptz; v_to_ts timestamptz; v_result jsonb;
begin
  perform private.require_platform_admin();
  if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_from_ts:=p_from::timestamp at time zone v_tz; v_to_ts:=(p_to+1)::timestamp at time zone v_tz;
  select jsonb_build_object(
    'from',p_from,'to',p_to,
    'summary',jsonb_build_object(
      'appointments',(select count(*) from public.appointments a where a.created_at>=v_from_ts and a.created_at<v_to_ts),
      'completed',(select count(*) from public.appointments a where a.status='completed' and a.completed_at>=v_from_ts and a.completed_at<v_to_ts),
      'cancelled',(select count(*) from public.appointments a where a.status='cancelled' and a.cancelled_at>=v_from_ts and a.cancelled_at<v_to_ts),
      'no_show',(select count(*) from public.appointments a where a.status='no_show' and a.no_show_at>=v_from_ts and a.no_show_at<v_to_ts),
      'revenue_cents',(select coalesce(sum(a.price_cents),0) from public.appointments a where a.status='completed' and a.completed_at>=v_from_ts and a.completed_at<v_to_ts),
      'payments_paid_cents',(select coalesce(sum(pay.amount_cents),0) from public.payments pay where pay.status='paid' and pay.paid_at>=v_from_ts and pay.paid_at<v_to_ts),
      'new_customers',(select count(*) from public.customers c where c.created_at>=v_from_ts and c.created_at<v_to_ts),
      'new_shops',(select count(*) from public.barbershops s where s.created_at>=v_from_ts and s.created_at<v_to_ts),
      'new_users',(select count(*) from public.profiles p where p.created_at>=v_from_ts and p.created_at<v_to_ts)
    ),
    'daily',coalesce((
      select jsonb_agg(jsonb_build_object('date',d.day,'appointments',coalesce(x.appointments,0),'completed',coalesce(x.completed,0),'revenue_cents',coalesce(x.revenue_cents,0)) order by d.day)
      from generate_series(p_from,p_to,interval '1 day') d(day)
      left join lateral (
        select count(*) appointments,count(*) filter(where a.status='completed' and a.completed_at is not null) completed,coalesce(sum(a.price_cents) filter(where a.status='completed'),0) revenue_cents
        from public.appointments a
        where (a.created_at at time zone v_tz)::date=d.day
          or (a.status='completed' and a.completed_at is not null and (a.completed_at at time zone v_tz)::date=d.day)
      ) x on true
    ),'[]'::jsonb),
    'shop_status',coalesce((select jsonb_object_agg(status::text,cnt) from (select s.status,count(*) cnt from public.barbershops s group by s.status) x),'{}'::jsonb),
    'plans',coalesce((
      select jsonb_agg(jsonb_build_object('code',x.code,'name',x.name,'shops',x.shops,'price_cents',x.price_cents) order by x.price_cents,x.name)
      from (select p.code,p.name,p.price_cents,count(s.id)::bigint shops from public.plans p left join public.barbershops s on s.plan_id=p.id group by p.id,p.code,p.name,p.price_cents) x
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_get_metrics(date,date) from public,anon,authenticated;
grant execute on function public.admin_get_metrics(date,date) to authenticated;