create or replace function public.reschedule_appointment_by_token(p_token uuid,p_new_start timestamptz)
returns table(new_starts_at timestamptz,new_ends_at timestamptz)
language plpgsql security definer set search_path=''
as $fn$
declare
  a public.appointments%rowtype; sh public.barbershops%rowtype; svc public.services%rowtype; c public.customers%rowtype;
  v_date date; v_end timestamptz; v_available boolean; v_deadline timestamptz; v_old_start timestamptz;
begin
  if p_new_start is null then raise exception 'INVALID_DATE'; end if;
  select * into a from public.appointments where manage_token=p_token;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  select * into sh from public.barbershops where id=a.barbershop_id;
  if a.status not in ('pending','confirmed') or a.starts_at<=now() then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE'; end if;
  if sh.cancellation_rule='contact_only' then raise exception 'CANCELLATION_POLICY_CONTACT_ONLY'; end if;
  v_deadline:=a.starts_at;
  if sh.cancellation_rule='flex_2h' then v_deadline:=a.starts_at-interval '2 hours';
  elsif sh.cancellation_rule='moderate_6h' then v_deadline:=a.starts_at-interval '6 hours';
  elsif sh.cancellation_rule='strict_24h' then v_deadline:=a.starts_at-interval '24 hours';
  end if;
  if now()>v_deadline then raise exception 'CANCELLATION_POLICY_LOCKED'; end if;
  if a.deposit_status='awaiting' and a.hold_expires_at is not null and a.hold_expires_at<=now() then
    raise exception 'BOOKING_HOLD_EXPIRED';
  end if;
  v_old_start:=a.starts_at;
  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments where id=a.id for update;
  if a.starts_at=p_new_start then return query select a.starts_at,a.ends_at; return; end if;
  select * into svc from public.services where id=a.service_id and barbershop_id=a.barbershop_id and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  v_date:=(p_new_start at time zone sh.timezone)::date;
  select exists(select 1 from public.get_available_slots(sh.slug,a.service_id,a.barber_id,v_date) x where x.slot_start=p_new_start)
    into v_available;
  if not v_available then raise exception 'SLOT_TAKEN'; end if;
  v_end:=p_new_start+make_interval(mins=>svc.duration_min);
  select * into c from public.customers where id=a.customer_id and barbershop_id=a.barbershop_id;
  update public.notifications set status='skipped',error='appointment_rescheduled'
  where appointment_id=a.id and status='queued' and template_key in ('reminder_24h','reminder_1h');
  update public.appointments set starts_at=p_new_start,ends_at=v_end where id=a.id;
  if c.phone is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(a.barbershop_id,a.id,'whatsapp','appointment_rescheduled',c.phone,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',v_old_start,'starts_at',p_new_start,'ends_at',v_end));
    if p_new_start-interval '24 hours'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'whatsapp','reminder_24h',c.phone,p_new_start-interval '24 hours',jsonb_build_object('manage_token',a.manage_token));
    end if;
    if p_new_start-interval '1 hour'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(a.barbershop_id,a.id,'whatsapp','reminder_1h',c.phone,p_new_start-interval '1 hour',jsonb_build_object('manage_token',a.manage_token));
    end if;
  end if;
  if c.email is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(a.barbershop_id,a.id,'email','appointment_rescheduled',c.email,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',v_old_start,'starts_at',p_new_start,'ends_at',v_end));
  end if;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(a.barbershop_id,null,'appointment_rescheduled','appointment',a.id,
    jsonb_build_object('source','token','old_starts_at',v_old_start,'new_starts_at',p_new_start,'new_ends_at',v_end));
  return query select p_new_start,v_end;
exception when exclusion_violation then
  raise exception 'SLOT_TAKEN';
end;
$fn$;

revoke all on function public.reschedule_appointment_by_token(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.reschedule_appointment_by_token(uuid,timestamptz) to anon,authenticated;
