-- Payments intentionally unavailable during store launch. No provider request is needed.
insert into public.platform_settings(key,value) values('payments','{"enabled":false}'::jsonb)
 on conflict(key) do update set value=public.platform_settings.value||'{"enabled":false}'::jsonb,updated_at=now();
create or replace function private.payments_available()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select value->'enabled'='true'::jsonb from public.platform_settings where key='payments'),false);
$$;
revoke all on function private.payments_available() from public,anon,authenticated;
grant execute on function private.payments_available() to postgres,service_role;
update public.barbershops set deposit_enabled=false where deposit_enabled;
create or replace function private.prevent_unavailable_deposit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deposit_enabled and not private.payments_available() then raise exception 'PAYMENTS_UNAVAILABLE'; end if;
 return new;
end; $$;
revoke all on function private.prevent_unavailable_deposit() from public,anon,authenticated;
create trigger barbershops_deposits_unavailable before insert or update of deposit_enabled on public.barbershops for each row execute function private.prevent_unavailable_deposit();
CREATE OR REPLACE FUNCTION public.get_public_payment_methods(p_slug text)
 RETURNS TABLE(payment_providers payment_provider[])
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    array_agg(a.provider order by a.provider),
    '{}'::public.payment_provider[]
  )
  from public.barbershops s
  left join public.payment_accounts a
    on a.barbershop_id=s.id
   and a.enabled=true
   and a.credential_secret_id is not null
  where private.payments_available() and s.slug=p_slug
    and s.status in ('active','trial');
$function$;

CREATE OR REPLACE FUNCTION public.init_payment_from_token(p_token uuid, p_provider payment_provider, p_msisdn text, p_idempotency_key uuid)
 RETURNS TABLE(payment_id uuid, provider payment_provider, provider_ref text, amount_cents integer, msisdn text, hold_expires_at timestamp with time zone, reused boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  pa public.payment_accounts%rowtype;
  pay public.payments%rowtype;
  v_phone text:=regexp_replace(coalesce(p_msisdn,''),'[^0-9]','','g');
  v_payment_id uuid;
  v_provider_ref text;
begin
 if not private.payments_available() then raise exception 'PAYMENTS_UNAVAILABLE'; end if;
  if p_token is null or p_idempotency_key is null then raise exception 'PAYMENT_REQUEST_INVALID'; end if;
  if v_phone like '258%' then v_phone:='+'||v_phone;
  elsif v_phone like '0%' and length(v_phone)=10 then v_phone:='+258'||substring(v_phone from 2);
  elsif v_phone like '8%' and length(v_phone)=9 then v_phone:='+258'||v_phone;
  else raise exception 'INVALID_PHONE'; end if;

  if p_provider='emola' and not (regexp_replace(v_phone,'[^0-9]','','g') ~ '^258(86|87)[0-9]{7}$') then raise exception 'EMOLA_PHONE_INVALID'; end if;

  select * into a from public.appointments x where x.manage_token=p_token for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments x where x.id=a.id for update;

  if a.status<>'pending' or a.deposit_status<>'awaiting' or a.deposit_cents<=0 then
    if a.deposit_status='paid' then raise exception 'PAYMENT_ALREADY_PAID'; end if;
    raise exception 'PAYMENT_NOT_REQUIRED';
  end if;
  if a.hold_expires_at is null or a.hold_expires_at<=now() then raise exception 'BOOKING_HOLD_EXPIRED'; end if;

  select * into pa from public.payment_accounts x where x.barbershop_id=a.barbershop_id and x.provider=p_provider and x.enabled=true for update;
  if not found then raise exception 'PAYMENT_PROVIDER_DISABLED'; end if;
  if pa.credential_secret_id is null then raise exception 'PAYMENT_PROVIDER_NOT_CONFIGURED'; end if;

  select * into pay from public.payments x where x.idempotency_key=p_idempotency_key::text limit 1;
  if found then
    if pay.appointment_id is distinct from a.id then raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
    return query select pay.id,pay.provider,pay.provider_ref,pay.amount_cents,pay.msisdn,a.hold_expires_at,true; return;
  end if;

  select * into pay from public.payments x where x.appointment_id=a.id and x.status='pending' order by x.created_at desc limit 1 for update;
  if found then
    if pay.provider=p_provider then
      update public.payments x set msisdn=v_phone,updated_at=now() where x.id=pay.id returning * into pay;
      return query select pay.id,pay.provider,pay.provider_ref,pay.amount_cents,pay.msisdn,a.hold_expires_at,true; return;
    end if;
    update public.payments x set status='failed',failure_code='REPLACED_BY_NEW_ATTEMPT',failure_reason='Cliente iniciou um método de pagamento diferente.',failed_at=now(),updated_at=now() where x.id=pay.id;
  end if;

  v_payment_id:=extensions.gen_random_uuid();
  v_provider_ref:='BO-'||upper(substr(replace(v_payment_id::text,'-',''),1,24));
  insert into public.payments(id,barbershop_id,appointment_id,provider_account_id,provider,amount_cents,msisdn,status,provider_ref,idempotency_key)
  values(v_payment_id,a.barbershop_id,a.id,pa.id,p_provider,a.deposit_cents,v_phone,'pending',v_provider_ref,p_idempotency_key::text)
  returning * into pay;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(a.barbershop_id,null,'payment_initiated','payment',pay.id,jsonb_build_object('appointment_id',a.id,'provider',pay.provider::text,'amount_cents',pay.amount_cents));

  return query select pay.id,pay.provider,pay.provider_ref,pay.amount_cents,pay.msisdn,a.hold_expires_at,false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_shop_order_payment(p_barbershop_id uuid, p_order_id uuid, p_amount_minor bigint, p_payment_method text, p_confirmation_reference text, p_confirmation_note text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid(); v_order public.appointment_product_orders%rowtype;
 v_existing public.shop_order_payments%rowtype; v_payment public.shop_order_payments%rowtype;
 v_due bigint; v_paid bigint; v_balance bigint;
 v_reference text:=nullif(btrim(p_confirmation_reference),'');
 v_note text:=nullif(btrim(p_confirmation_note),'');
begin
 if not private.payments_available() then raise exception 'PAYMENTS_UNAVAILABLE'; end if;
 if v_actor is null or not public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
 then raise exception 'SHOP_PAYMENT_FORBIDDEN' using errcode='42501'; end if;
 if p_amount_minor is null or p_amount_minor<1 then raise exception 'SHOP_PAYMENT_AMOUNT_INVALID'; end if;
 if p_payment_method not in ('cash','pos','mpesa','emola','bank_transfer','other') then raise exception 'SHOP_PAYMENT_METHOD_INVALID'; end if;
 if p_idempotency_key is null then raise exception 'SHOP_PAYMENT_IDEMPOTENCY_KEY_REQUIRED'; end if;
 if v_note is null or length(v_note) not between 12 and 500 then raise exception 'SHOP_PAYMENT_CONFIRMATION_NOTE_REQUIRED'; end if;
 if p_payment_method in ('pos','mpesa','emola','bank_transfer') and (v_reference is null or length(v_reference) not between 3 and 160)
 then raise exception 'SHOP_PAYMENT_REFERENCE_REQUIRED'; end if;
 if v_reference is not null and length(v_reference) not between 3 and 160 then raise exception 'SHOP_PAYMENT_REFERENCE_INVALID'; end if;
 select * into v_order from public.appointment_product_orders o
 where o.id=p_order_id and o.barbershop_id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_PAYMENT_ORDER_NOT_FOUND' using errcode='P0002'; end if;
 if v_order.status::text not in ('delivered','partially_delivered') then raise exception 'SHOP_PAYMENT_ORDER_NOT_DELIVERED'; end if;
 select * into v_existing from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.order_id=p_order_id and p.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.amount_minor<>p_amount_minor or v_existing.payment_method<>p_payment_method
   or v_existing.confirmation_reference is distinct from v_reference or v_existing.confirmation_note is distinct from v_note
  then raise exception 'SHOP_PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
  select coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) into v_due from public.appointment_product_order_items i where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id;
  select coalesce(sum(p.amount_minor),0) into v_paid from public.shop_order_payments p where p.order_id=p_order_id and p.barbershop_id=p_barbershop_id;
  return jsonb_build_object('payment_id',v_existing.id,'order_id',p_order_id,'amount_minor',v_existing.amount_minor,
   'due_minor',v_due,'paid_minor',v_paid,'balance_minor',greatest(0,v_due-v_paid),'idempotent',true,
   'confirmation_model','staff_confirmed_not_provider_reconciled');
 end if;
 select coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) into v_due from public.appointment_product_order_items i where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id;
 if v_due<1 then raise exception 'SHOP_PAYMENT_NO_DELIVERED_VALUE'; end if;
 select coalesce(sum(p.amount_minor),0) into v_paid from public.shop_order_payments p where p.order_id=p_order_id and p.barbershop_id=p_barbershop_id;
 v_balance:=v_due-v_paid;
 if v_balance<1 then raise exception 'SHOP_PAYMENT_ORDER_ALREADY_SETTLED'; end if;
 if p_amount_minor>v_balance then raise exception 'SHOP_PAYMENT_EXCEEDS_BALANCE'; end if;
 insert into public.shop_order_payments(barbershop_id,order_id,amount_minor,payment_method,confirmation_reference,confirmation_note,idempotency_key,recorded_by)
 values(p_barbershop_id,p_order_id,p_amount_minor,p_payment_method,v_reference,v_note,p_idempotency_key,v_actor) returning * into v_payment;
 v_paid:=v_paid+v_payment.amount_minor;
 return jsonb_build_object('payment_id',v_payment.id,'order_id',p_order_id,'amount_minor',v_payment.amount_minor,
  'due_minor',v_due,'paid_minor',v_paid,'balance_minor',greatest(0,v_due-v_paid),'idempotent',false,
  'confirmation_model','staff_confirmed_not_provider_reconciled');
end;
$function$;

notify pgrst,'reload schema';
