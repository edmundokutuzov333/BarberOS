-- BarberOS Phase 16 patch: expose only safe payment runtime metadata and
-- close the late-success customer communication path.

drop function if exists public.get_payment_runtime_config(uuid);
create function public.get_payment_runtime_config(p_payment uuid)
returns table(
  payment_id uuid,
  appointment_id uuid,
  barbershop_id uuid,
  provider public.payment_provider,
  provider_account_id uuid,
  provider_ref text,
  amount_cents integer,
  msisdn text,
  status public.payment_state,
  requires_refund boolean,
  public_config jsonb,
  credentials jsonb
)
language sql security definer set search_path=''
as $fn$
  select p.id,p.appointment_id,p.barbershop_id,p.provider,p.provider_account_id,p.provider_ref,
         p.amount_cents,p.msisdn,p.status,p.requires_refund,pa.public_config,
         coalesce((select d.decrypted_secret::jsonb from vault.decrypted_secrets d where d.id=pa.credential_secret_id),'{}'::jsonb)
  from public.payments p
  join public.payment_accounts pa on pa.id=p.provider_account_id
  where p.id=p_payment;
$fn$;
revoke all on function public.get_payment_runtime_config(uuid) from public,anon,authenticated;
grant execute on function public.get_payment_runtime_config(uuid) to service_role;

drop function if exists public.get_payment_runtime_for_token(uuid);
create function public.get_payment_runtime_for_token(p_token uuid)
returns table(
  payment_id uuid,appointment_id uuid,barbershop_id uuid,
  provider public.payment_provider,provider_account_id uuid,provider_ref text,
  amount_cents integer,msisdn text,status public.payment_state,requires_refund boolean,
  hold_expires_at timestamptz,appointment_status public.appointment_status,
  public_config jsonb,credentials jsonb
)
language sql security definer set search_path=''
as $fn$
  select p.id,p.appointment_id,p.barbershop_id,p.provider,p.provider_account_id,p.provider_ref,
         p.amount_cents,p.msisdn,p.status,p.requires_refund,a.hold_expires_at,a.status,
         pa.public_config,
         coalesce((select d.decrypted_secret::jsonb from vault.decrypted_secrets d where d.id=pa.credential_secret_id),'{}'::jsonb)
  from public.appointments a
  join public.payments p on p.appointment_id=a.id
  join public.payment_accounts pa on pa.id=p.provider_account_id
  where a.manage_token=p_token
  order by p.created_at desc
  limit 1;
$fn$;
revoke all on function public.get_payment_runtime_for_token(uuid) from public,anon,authenticated;
grant execute on function public.get_payment_runtime_for_token(uuid) to service_role;

drop function if exists public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb);
create function public.finalize_payment_event(
  p_payment uuid,p_state public.payment_state,p_provider_transaction_id text,
  p_provider_status text,p_provider_message text,p_raw jsonb default '{}'::jsonb
)
returns table(payment_id uuid,payment_status public.payment_state,appointment_status public.appointment_status,late_success boolean,requires_refund boolean)
language plpgsql security definer set search_path=''
as $fn$
declare
  p public.payments%rowtype;
  a public.appointments%rowtype;
  c public.customers%rowtype;
  v_late boolean:=false;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'PAYMENT_STATE_INVALID'; end if;
  select * into p from public.payments where id=p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if p.status='paid' and p_state='paid' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund;
    return;
  end if;
  if p.status='refunded' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund;
    return;
  end if;
  if p.status='failed' and p_state='failed' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund;
    return;
  end if;

  select * into a from public.appointments where id=p.appointment_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments where id=a.id for update;
  select * into c from public.customers where id=a.customer_id and barbershop_id=a.barbershop_id;

  if p_state='paid' then
    if a.status='pending' and a.deposit_status='awaiting' and a.hold_expires_at is not null and a.hold_expires_at>now() then
      update public.notifications set status='skipped',error='payment_confirmed'
      where appointment_id=a.id and status='queued' and template_key='appointment_pending';

      update public.appointments
      set deposit_status='paid',status='confirmed',confirmed_at=coalesce(confirmed_at,now()),hold_expires_at=null
      where id=a.id;

      update public.payments
      set status='paid',paid_at=coalesce(paid_at,now()),
          provider_transaction_id=coalesce(nullif(btrim(p_provider_transaction_id),''),provider_transaction_id),
          failure_code=null,failure_reason=null,raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
      where id=p.id returning * into p;

      perform public.enqueue_appointment_notifications(a.id);

      insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
      values(a.barbershop_id,null,'payment_paid','payment',p.id,
        jsonb_build_object('appointment_id',a.id,'provider_status',left(coalesce(p_provider_status,''),100),'amount_cents',p.amount_cents));
    else
      v_late:=true;
      update public.notifications set status='skipped',error='payment_after_hold_expired'
      where appointment_id=a.id and status='queued' and template_key in ('appointment_pending','reminder_24h','reminder_1h');

      if a.status='pending' and a.deposit_status='awaiting' then
        update public.appointments set status='cancelled',
          cancelled_at=coalesce(cancelled_at,now()),
          cancel_reason=coalesce(cancel_reason,'deposit_timeout'),hold_expires_at=null
        where id=a.id;

        if c.phone is not null then
          insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
          values(a.barbershop_id,a.id,'whatsapp','appointment_cancelled',c.phone,now(),
            jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at,'cancel_reason','deposit_timeout'));
        end if;
        if c.email is not null then
          insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
          values(a.barbershop_id,a.id,'email','appointment_cancelled',c.email,now(),
            jsonb_build_object('manage_token',a.manage_token,'starts_at',a.starts_at,'cancel_reason','deposit_timeout'));
        end if;
      end if;

      update public.payments
      set status='paid',paid_at=coalesce(paid_at,now()),
          provider_transaction_id=coalesce(nullif(btrim(p_provider_transaction_id),''),provider_transaction_id),
          requires_refund=true,failure_code='LATE_PAYMENT',
          failure_reason='Pagamento recebido depois da expiração/cancelamento da marcação.',
          raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
      where id=p.id returning * into p;

      insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
      values(a.barbershop_id,null,'payment_late_success_requires_refund','payment',p.id,
        jsonb_build_object('appointment_id',a.id,'amount_cents',p.amount_cents));
    end if;
  elsif p_state='failed' then
    update public.payments
    set status='failed',
        provider_transaction_id=coalesce(nullif(btrim(p_provider_transaction_id),''),provider_transaction_id),
        failure_code=nullif(btrim(p_provider_status),''),
        failure_reason=left(coalesce(p_provider_message,''),500),
        failed_at=now(),raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
    where id=p.id returning * into p;

    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(a.barbershop_id,null,'payment_failed','payment',p.id,
      jsonb_build_object('appointment_id',a.id,'provider_status',left(coalesce(p_provider_status,''),100)));
  else
    update public.payments set status='refunded',
      provider_transaction_id=coalesce(nullif(btrim(p_provider_transaction_id),''),provider_transaction_id),
      requires_refund=false,raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
    where id=p.id returning * into p;
    if a.deposit_status='paid' then update public.appointments set deposit_status='refunded' where id=a.id; end if;

    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(a.barbershop_id,null,'payment_refunded','payment',p.id,jsonb_build_object('appointment_id',a.id,'amount_cents',p.amount_cents));
  end if;

  select * into a from public.appointments where id=p.appointment_id;
  return query select p.id,p.status,a.status,v_late,p.requires_refund;
end;
$fn$;
revoke all on function public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb) to service_role;
