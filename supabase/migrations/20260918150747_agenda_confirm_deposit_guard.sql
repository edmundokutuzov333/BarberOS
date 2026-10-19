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
    if a.status<>'confirmed' or a.starts_at > now()+interval '30 minutes' then
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
$function$;

revoke all on function public.transition_appointment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_appointment(uuid, uuid, text, text) to authenticated;
grant execute on function public.transition_appointment(uuid, uuid, text, text) to service_role;
