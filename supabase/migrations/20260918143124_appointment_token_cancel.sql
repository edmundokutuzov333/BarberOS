create or replace function public.cancel_appointment_by_token(p_token uuid,p_reason text default null)
returns table(cancelled_at timestamptz)
language plpgsql security definer set search_path=''
as $fn$
declare
  a public.appointments%rowtype; sh public.barbershops%rowtype; c public.customers%rowtype;
  v_reason text; v_deadline timestamptz; v_cancelled_at timestamptz;
begin
  select * into a from public.appointments where manage_token=p_token for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  select * into sh from public.barbershops where id=a.barbershop_id;
  if a.status not in ('pending','confirmed') or a.starts_at<=now() then raise exception 'APPOINTMENT_NOT_CANCELLABLE'; end if;
  if sh.cancellation_rule='contact_only' then raise exception 'CANCELLATION_POLICY_CONTACT_ONLY'; end if;
  v_deadline:=a.starts_at;
  if sh.cancellation_rule='flex_2h' then v_deadline:=a.starts_at-interval '2 hours';
  elsif sh.cancellation_rule='moderate_6h' then v_deadline:=a.starts_at-interval '6 hours';
  elsif sh.cancellation_rule='strict_24h' then v_deadline:=a.starts_at-interval '24 hours';
  end if;
  if now()>v_deadline then raise exception 'CANCELLATION_POLICY_LOCKED'; end if;
  v_reason:=nullif(btrim(p_reason),'');
  if v_reason is not null and length(v_reason)>500 then raise exception 'INVALID_CANCEL_REASON'; end if;
  select * into c from public.customers where id=a.customer_id and barbershop_id=a.barbershop_id;
  update public.notifications set status='skipped',error='appointment_cancelled'
  where appointment_id=a.id and status='queued' and template_key in ('reminder_24h','reminder_1h');
  update public.appointments set status='cancelled',cancelled_at=now(),cancel_reason=v_reason
  where id=a.id returning public.appointments.cancelled_at into v_cancelled_at;
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
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(a.barbershop_id,null,'appointment_cancelled','appointment',a.id,
    jsonb_build_object('source','token','cancel_reason',v_reason,'previous_status',a.status::text));
  return query select v_cancelled_at;
end;
$fn$;

revoke all on function public.cancel_appointment_by_token(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_appointment_by_token(uuid,text) to anon,authenticated;
