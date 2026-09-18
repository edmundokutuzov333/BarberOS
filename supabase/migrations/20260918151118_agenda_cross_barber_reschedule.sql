CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_operator(p_shop uuid, p_appointment uuid, p_new_start timestamp with time zone, p_new_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(appointment_id uuid, new_starts_at timestamp with time zone, new_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  svc public.services%rowtype;
  c public.customers%rowtype;
  sh public.barbershops%rowtype;
  target_barber uuid;
  new_barber_name text;
  old_barber uuid;
  old_start timestamptz;
  v_date date;
  v_end timestamptz;
  v_available boolean;
begin
  if p_new_start is null then raise exception 'INVALID_DATE'; end if;

  select * into a
  from public.appointments
  where id=p_appointment and barbershop_id=p_shop;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

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

  if a.status not in ('pending','confirmed') or a.starts_at <= now() then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  target_barber:=coalesce(p_new_barber_id,a.barber_id);
  old_barber:=a.barber_id;

  if target_barber is null then raise exception 'BARBER_NOT_FOUND'; end if;

  if target_barber<>old_barber then
    if target_barber::text < old_barber::text then
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || target_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || old_barber::text,0));
    else
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || old_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || target_barber::text,0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('barber-booking:' || old_barber::text,0));
  end if;

  select * into a
  from public.appointments
  where id=p_appointment and barbershop_id=p_shop
  for update;

  if a.starts_at=p_new_start and a.barber_id=target_barber then
    return query select a.id,a.starts_at,a.ends_at;
    return;
  end if;

  select * into sh from public.barbershops where id=p_shop;
  select * into svc from public.services
  where id=a.service_id and barbershop_id=p_shop and is_active;

  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.barbers b
    join public.barber_services bs on bs.barber_id=b.id
    where b.id=target_barber
      and b.barbershop_id=p_shop
      and b.is_active
      and bs.service_id=a.service_id
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  if p_new_start <= now() then raise exception 'INVALID_DATE'; end if;

  v_date:=(p_new_start at time zone sh.timezone)::date;

  select exists(
    select 1
    from public.get_available_slots(sh.slug,a.service_id,target_barber,v_date) x
    where x.slot_start=p_new_start
  ) into v_available;

  if not v_available then raise exception 'SLOT_TAKEN'; end if;

  old_start:=a.starts_at;
  v_end:=p_new_start+make_interval(mins=>svc.duration_min);

  select * into c
  from public.customers
  where id=a.customer_id and barbershop_id=p_shop;

  select b.display_name into new_barber_name
  from public.barbers b
  where b.id=target_barber and b.barbershop_id=p_shop;

  update public.notifications
  set status='skipped', error='appointment_rescheduled'
  where appointment_id=a.id
    and status='queued'
    and template_key in ('reminder_24h','reminder_1h');

  update public.appointments
  set barber_id=target_barber,
      starts_at=p_new_start,
      ends_at=v_end
  where id=a.id;

  if c.phone is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(
      p_shop,a.id,'whatsapp','appointment_rescheduled',c.phone,now(),
      jsonb_build_object(
        'manage_token',a.manage_token,
        'old_starts_at',old_start,
        'starts_at',p_new_start,
        'ends_at',v_end,
        'old_barber_id',old_barber,
        'new_barber_id',target_barber
      )
    );

    if p_new_start-interval '24 hours' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_24h',c.phone,p_new_start-interval '24 hours',
        jsonb_build_object('manage_token',a.manage_token));
    end if;

    if p_new_start-interval '1 hour' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_1h',c.phone,p_new_start-interval '1 hour',
        jsonb_build_object('manage_token',a.manage_token));
    end if;
  end if;

  if c.email is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(
      p_shop,a.id,'email','appointment_rescheduled',c.email,now(),
      jsonb_build_object(
        'manage_token',a.manage_token,
        'old_starts_at',old_start,
        'starts_at',p_new_start,
        'ends_at',v_end,
        'old_barber_id',old_barber,
        'new_barber_id',target_barber
      )
    );
  end if;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(
    p_shop,auth.uid(),'appointment_rescheduled','appointment',a.id,
    jsonb_build_object(
      'source','operator',
      'old_starts_at',old_start,
      'new_starts_at',p_new_start,
      'new_ends_at',v_end,
      'old_barber_id',old_barber,
      'new_barber_id',target_barber,
      'new_barber_name',new_barber_name
    )
  );

  return query select a.id,p_new_start,v_end;
exception
  when exclusion_violation then raise exception 'SLOT_TAKEN';
end;
$function$


revoke all on function public.reschedule_appointment_by_operator(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.reschedule_appointment_by_operator(uuid,uuid,timestamptz,uuid) to authenticated;
