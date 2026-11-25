-- Operational policy; no payment changes.
alter table public.barbershops add column late_grace_min integer not null default 0 check(late_grace_min between 0 and 120);
grant select(late_grace_min),update(late_grace_min) on public.barbershops to authenticated;
CREATE OR REPLACE FUNCTION public.transition_appointment(p_shop uuid, p_appointment uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(appointment_id uuid, previous_status appointment_status, status appointment_status, confirmed_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, cancelled_at timestamp with time zone, no_show_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  c public.customers%rowtype;
  v_action text;
  v_reason text;
  v_previous public.appointment_status;
begin
  if p_appointment is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  v_action:=lower(btrim(coalesce(p_action,'')));

  if v_action not in ('confirm','start','complete','no_show','cancel') then
    raise exception 'INVALID_APPOINTMENT_ACTION';
  end if;

  select * into a
  from public.appointments
  where id=p_appointment and barbershop_id=p_shop;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if private.is_platform_admin() then
    null;
  elsif private.is_member(p_shop,array['owner','manager']::public.app_role[]) then
    null;
  elsif private.is_member(p_shop,array['barber']::public.app_role[])
    and a.barber_id=private.my_barber_id(p_shop) then
    null;
  else
    raise exception 'SHOP_OPERATOR_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || a.barber_id::text,0));

  select * into a
  from public.appointments
  where id=p_appointment and barbershop_id=p_shop
  for update;

  v_previous:=a.status;

  if v_action='confirm' then
    if a.status<>'pending' then
      raise exception 'APPOINTMENT_TRANSITION_INVALID';
    end if;

    if a.deposit_status not in ('not_required','paid') then
      raise exception 'DEPOSIT_REQUIRED';
    end if;

    update public.notifications
    set status='skipped', error='appointment_confirmed'
    where appointment_id=a.id
      and status='queued'
      and template_key='appointment_pending';

    update public.appointments
    set status='confirmed', confirmed_at=coalesce(confirmed_at,now())
    where id=a.id;

    select * into c from public.customers
    where id=a.customer_id and barbershop_id=a.barbershop_id;

    if c.phone is not null then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'whatsapp','appointment_confirmed',c.phone,now(),
        jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at));

      if a.starts_at-interval '24 hours' > now() then
        insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
        values(a.barbershop_id,a.id,'whatsapp','reminder_24h',c.phone,a.starts_at-interval '24 hours',
          jsonb_build_object('manage_token',a.manage_token));
      end if;

      if a.starts_at-interval '1 hour' > now() then
        insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
        values(a.barbershop_id,a.id,'whatsapp','reminder_1h',c.phone,a.starts_at-interval '1 hour',
          jsonb_build_object('manage_token',a.manage_token));
      end if;
    end if;

    if c.email is not null then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'email','appointment_confirmed',c.email,now(),
        jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at));
    end if;

  elsif v_action='start' then
    if a.status<>'confirmed' or a.starts_at > now()+interval '30 minutes' then
      raise exception 'APPOINTMENT_TRANSITION_INVALID';
    end if;

    update public.appointments
    set status='in_progress', started_at=coalesce(started_at,now())
    where id=a.id;

  elsif v_action='complete' then
    if a.status<>'in_progress' then
      raise exception 'APPOINTMENT_TRANSITION_INVALID';
    end if;

    update public.appointments
    set status='completed'
    where id=a.id;

  elsif v_action='no_show' then
    if a.status<>'confirmed' or now()<a.starts_at+make_interval(mins=>(select late_grace_min from public.barbershops where id=p_shop)) then
      raise exception 'APPOINTMENT_TRANSITION_INVALID';
    end if;

    update public.appointments
    set status='no_show'
    where id=a.id;

  elsif v_action='cancel' then
    if a.status not in ('pending','confirmed') then
      raise exception 'APPOINTMENT_TRANSITION_INVALID';
    end if;

    v_reason:=nullif(btrim(p_reason),'');
    if v_reason is not null and length(v_reason)>500 then
      raise exception 'INVALID_CANCEL_REASON';
    end if;

    select * into c from public.customers
    where id=a.customer_id and barbershop_id=a.barbershop_id;

    update public.notifications
    set status='skipped', error='appointment_cancelled'
    where appointment_id=a.id
      and status='queued'
      and template_key in ('reminder_24h','reminder_1h');

    update public.appointments
    set status='cancelled', cancelled_at=now(), cancel_reason=v_reason
    where id=a.id;

    if c.phone is not null then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'whatsapp','appointment_cancelled',c.phone,now(),
        jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at,'cancel_reason',v_reason));
    end if;

    if c.email is not null then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'email','appointment_cancelled',c.email,now(),
        jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at,'cancel_reason',v_reason));
    end if;
  end if;

  select * into a from public.appointments where id=p_appointment;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(
    p_shop,auth.uid(),
    case when v_action='confirm' then 'appointment_confirmed'
      when v_action='start' then 'appointment_started'
      when v_action='complete' then 'appointment_completed'
      when v_action='no_show' then 'appointment_no_show'
      else 'appointment_cancelled' end,
    'appointment',a.id,
    jsonb_build_object('source','operator','previous_status',v_previous::text,'new_status',a.status::text,'reason',v_reason)
  );

  return query
  select a.id,v_previous,a.status,a.confirmed_at,a.started_at,a.completed_at,a.cancelled_at,a.no_show_at;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.report_capacity_by_day(p_shop uuid, p_from date, p_to date, p_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_date date, barber_id uuid, capacity_minutes numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tz text; v_barber uuid;
begin
  if p_from is null or p_to is null or p_to<p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber:=private.resolve_report_barber(p_shop,p_barber_id);
  select s.timezone into v_tz from public.barbershops s where s.id=p_shop;
  if v_tz is null then raise exception 'SHOP_REQUIRED'; end if;
  return query
  with days as (select generate_series(p_from,p_to,interval '1 day')::date calendar_day),
  barber_base as (
    select b.id report_barber_id,b.sort_order from public.barbers b
    where b.barbershop_id=p_shop and ((v_barber is null and b.is_active) or b.id=v_barber)
  ), schedule as (
    select d.calendar_day,bb.report_barber_id,
      case when ov.id is not null then ov.opens_at else wh.opens_at end opens_at,
      case when ov.id is not null then ov.closes_at else wh.closes_at end closes_at,
      case when ov.id is not null then ov.is_closed when wh.id is null then true else wh.is_closed end is_closed
    from days d cross join barber_base bb
    left join lateral (
      select o.id,o.is_closed,o.opens_at,o.closes_at from public.schedule_overrides o
      where o.barbershop_id=p_shop and o.override_date=d.calendar_day and (o.barber_id=bb.report_barber_id or o.barber_id is null)
      order by case when o.barber_id=bb.report_barber_id then 0 else 1 end limit 1
    ) ov on true
    left join lateral (
      select w.id,w.opens_at,w.closes_at,w.is_closed from public.working_hours w
      where w.barbershop_id=p_shop and w.weekday=extract(dow from d.calendar_day)::int and (w.barber_id=bb.report_barber_id or w.barber_id is null)
      order by case when w.barber_id=bb.report_barber_id then 0 else 1 end limit 1
    ) wh on true
  ), open_schedule as (
    select sc.calendar_day schedule_day,sc.report_barber_id,
      ((sc.calendar_day::timestamp+sc.opens_at) at time zone v_tz) open_ts,
      ((sc.calendar_day::timestamp+sc.closes_at) at time zone v_tz) close_ts
    from schedule sc where not sc.is_closed and sc.opens_at is not null and sc.closes_at is not null and sc.closes_at>sc.opens_at
  ), raw_blocks as (
    select os.schedule_day,os.report_barber_id,greatest(tb.starts_at,os.open_ts) starts_at,least(tb.ends_at,os.close_ts) ends_at
    from open_schedule os join public.time_blocks tb
      on tb.barbershop_id=p_shop and (tb.barber_id=os.report_barber_id or tb.barber_id is null)
      and tb.starts_at<os.close_ts and tb.ends_at>os.open_ts
    union all
    select os.schedule_day,os.report_barber_id,
      greatest((os.schedule_day+w.break_start) at time zone v_tz,os.open_ts),
      least((os.schedule_day+w.break_end) at time zone v_tz,os.close_ts)
    from open_schedule os join public.working_hours w
      on w.barbershop_id=p_shop and (w.barber_id is null or w.barber_id=os.report_barber_id)
      and w.weekday=extract(dow from os.schedule_day)::int and not w.is_closed and w.break_start is not null
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
end $function$
;
