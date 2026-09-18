-- BarberOS Phase 16: payment RPC/API domain boundaries.

create or replace function public.get_payment_accounts(
  p_shop uuid,
  p_supabase_url text default null
)
returns table(
  id uuid,
  provider public.payment_provider,
  enabled boolean,
  account_reference text,
  public_config jsonb,
  configured boolean,
  webhook_url text,
  updated_at timestamptz
)
language plpgsql security definer set search_path=''
as $fn$
declare v_base text:=nullif(rtrim(coalesce(p_supabase_url,''),'/'),'');
begin
  if p_shop is null or not (
    public.is_platform_admin()
    or public.is_member(p_shop,array['owner','manager']::public.app_role[])
  ) then raise exception 'SHOP_OPERATOR_REQUIRED'; end if;

  return query
  select a.id,a.provider,a.enabled,a.account_reference,a.public_config,
    (
      a.credential_secret_id is not null
      and (
        (a.provider='mpesa' and a.public_config ? 'service_provider_code' and a.public_config ? 'base_url')
        or
        (a.provider='emola' and a.public_config ? 'partner_code' and a.public_config ? 'wsdl_url')
      )
    ),
    case when v_base<>'' and a.webhook_secret_id is not null then
      v_base||'/functions/v1/payments-webhook/'||a.provider::text||'/'||a.id::text||'/'||
      coalesce((select d.decrypted_secret from vault.decrypted_secrets d where d.id=a.webhook_secret_id),'')
    else null end,
    a.updated_at
  from public.payment_accounts a
  where a.barbershop_id=p_shop
  order by a.provider;
end;
$fn$;

revoke all on function public.get_payment_accounts(uuid,text) from public,anon;
grant execute on function public.get_payment_accounts(uuid,text) to authenticated;

create or replace function public.set_payment_provider_account(
  p_actor uuid,
  p_shop uuid,
  p_provider public.payment_provider,
  p_enabled boolean,
  p_account_reference text,
  p_public_config jsonb,
  p_credentials jsonb
)
returns table(
  id uuid,
  provider public.payment_provider,
  enabled boolean,
  configured boolean
)
language plpgsql security definer set search_path=''
as $fn$
declare
  a public.payment_accounts%rowtype;
  v_public jsonb;
  v_credentials jsonb:=coalesce(p_credentials,'{}'::jsonb);
  v_secret_name text;
  v_webhook_name text;
  v_token text;
begin
  if p_actor is null or not (
    public.is_platform_admin()
    or public.is_member(p_shop,array['owner','manager']::public.app_role[])
  ) then raise exception 'SHOP_OPERATOR_REQUIRED'; end if;

  if jsonb_typeof(coalesce(p_public_config,'{}'::jsonb))<>'object'
     or jsonb_typeof(v_credentials)<>'object' then
    raise exception 'PAYMENT_CONFIG_INVALID';
  end if;

  if p_provider='mpesa' then
    v_public:=jsonb_build_object(
      'base_url',trim(coalesce(p_public_config->>'base_url','')),
      'service_provider_code',trim(coalesce(p_public_config->>'service_provider_code','')),
      'origin',coalesce(nullif(trim(p_public_config->>'origin'),''),'*')
    );
    if v_public->>'base_url'='' or v_public->>'service_provider_code'='' then raise exception 'MPESA_CONFIG_INCOMPLETE'; end if;
    if jsonb_strip_nulls(v_credentials)<>'{}'::jsonb then
      if coalesce(trim(v_credentials->>'api_key'),'')='' or coalesce(trim(v_credentials->>'public_key'),'')='' then
        raise exception 'MPESA_CREDENTIALS_INCOMPLETE';
      end if;
      v_credentials:=jsonb_build_object('api_key',v_credentials->>'api_key','public_key',v_credentials->>'public_key');
    else v_credentials:='{}'::jsonb; end if;
  elsif p_provider='emola' then
    v_public:=jsonb_build_object(
      'wsdl_url',trim(coalesce(p_public_config->>'wsdl_url','')),
      'partner_code',trim(coalesce(p_public_config->>'partner_code','')),
      'language',coalesce(nullif(trim(p_public_config->>'language'),''),'pt')
    );
    if v_public->>'wsdl_url'='' or v_public->>'partner_code'='' then raise exception 'EMOLA_CONFIG_INCOMPLETE'; end if;
    if jsonb_strip_nulls(v_credentials)<>'{}'::jsonb then
      if coalesce(trim(v_credentials->>'username'),'')=''
         or coalesce(trim(v_credentials->>'password'),'')=''
         or coalesce(trim(v_credentials->>'api_key'),'')='' then
        raise exception 'EMOLA_CREDENTIALS_INCOMPLETE';
      end if;
      v_credentials:=jsonb_build_object(
        'username',v_credentials->>'username',
        'password',v_credentials->>'password',
        'api_key',v_credentials->>'api_key'
      );
    else v_credentials:='{}'::jsonb; end if;
  else raise exception 'PAYMENT_PROVIDER_INVALID'; end if;

  select * into a from public.payment_accounts
  where barbershop_id=p_shop and provider=p_provider for update;

  if not found then
    insert into public.payment_accounts(barbershop_id,provider,enabled,account_reference,public_config)
    values(p_shop,p_provider,coalesce(p_enabled,false),nullif(btrim(p_account_reference),''),v_public)
    returning * into a;
  else
    update public.payment_accounts
    set enabled=coalesce(p_enabled,false),
        account_reference=nullif(btrim(p_account_reference),''),
        public_config=v_public
    where id=a.id
    returning * into a;
  end if;

  v_secret_name:='barberos_payment_credentials_'||a.id::text;
  v_webhook_name:='barberos_payment_webhook_'||a.id::text;

  if a.webhook_secret_id is null then
    v_token:=encode(gen_random_bytes(24),'hex');
    a.webhook_secret_id:=vault.create_secret(
      v_token,v_webhook_name,'BarberOS per-account payment webhook capability token'
    );
    update public.payment_accounts set webhook_secret_id=a.webhook_secret_id where id=a.id;
  end if;

  if v_credentials<>'{}'::jsonb then
    if a.credential_secret_id is null then
      a.credential_secret_id:=vault.create_secret(
        v_credentials::text,v_secret_name,'BarberOS encrypted payment provider credentials'
      );
    else
      perform vault.update_secret(
        a.credential_secret_id,v_credentials::text,v_secret_name,
        'BarberOS encrypted payment provider credentials'
      );
    end if;
    update public.payment_accounts set credential_secret_id=a.credential_secret_id where id=a.id;
  end if;

  if p_enabled and a.credential_secret_id is null then raise exception 'PAYMENT_CREDENTIALS_REQUIRED'; end if;

  return query
  select x.id,x.provider,x.enabled,
    (
      x.credential_secret_id is not null
      and (
        (x.provider='mpesa' and x.public_config ? 'service_provider_code' and x.public_config ? 'base_url')
        or (x.provider='emola' and x.public_config ? 'partner_code' and x.public_config ? 'wsdl_url')
      )
    )
  from public.payment_accounts x where x.id=a.id;
end;
$fn$;

revoke all on function public.set_payment_provider_account(uuid,uuid,public.payment_provider,boolean,text,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.set_payment_provider_account(uuid,uuid,public.payment_provider,boolean,text,jsonb,jsonb)
to service_role;

create or replace function public.get_payment_runtime_config(p_payment uuid)
returns table(
  payment_id uuid,
  barbershop_id uuid,
  provider public.payment_provider,
  provider_account_id uuid,
  provider_ref text,
  amount_cents integer,
  msisdn text,
  status public.payment_state,
  public_config jsonb,
  credentials jsonb
)
language sql security definer set search_path=''
as $fn$
  select p.id,p.barbershop_id,p.provider,p.provider_account_id,p.provider_ref,p.amount_cents,p.msisdn,p.status,
         pa.public_config,
         coalesce((select d.decrypted_secret::jsonb from vault.decrypted_secrets d where d.id=pa.credential_secret_id),'{}'::jsonb)
  from public.payments p
  join public.payment_accounts pa on pa.id=p.provider_account_id
  where p.id=p_payment;
$fn$;
revoke all on function public.get_payment_runtime_config(uuid) from public,anon,authenticated;
grant execute on function public.get_payment_runtime_config(uuid) to service_role;

create or replace function public.get_payment_runtime_for_token(p_token uuid)
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
  public_config jsonb,
  credentials jsonb
)
language sql security definer set search_path=''
as $fn$
  select p.id,p.appointment_id,p.barbershop_id,p.provider,p.provider_account_id,p.provider_ref,p.amount_cents,p.msisdn,p.status,
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

create or replace function public.get_payment_webhook_context(p_account uuid,p_token text)
returns table(valid boolean,barbershop_id uuid,provider public.payment_provider)
language sql security definer set search_path=''
as $fn$
  select exists(
    select 1 from vault.decrypted_secrets d
    where d.id=a.webhook_secret_id and d.decrypted_secret=p_token
  ),a.barbershop_id,a.provider
  from public.payment_accounts a where a.id=p_account;
$fn$;
revoke all on function public.get_payment_webhook_context(uuid,text) from public,anon,authenticated;
grant execute on function public.get_payment_webhook_context(uuid,text) to service_role;

create or replace function public.init_payment_from_token(
  p_token uuid,p_provider public.payment_provider,p_msisdn text,p_idempotency_key uuid
)
returns table(payment_id uuid,provider public.payment_provider,provider_ref text,amount_cents integer,msisdn text,hold_expires_at timestamptz,reused boolean)
language plpgsql security definer set search_path=''
as $fn$
declare
  a public.appointments%rowtype;
  pa public.payment_accounts%rowtype;
  p public.payments%rowtype;
  v_phone text:=regexp_replace(coalesce(p_msisdn,''),'[^0-9]','','g');
  v_payment_id uuid;
  v_provider_ref text;
begin
  if p_token is null or p_idempotency_key is null then raise exception 'PAYMENT_REQUEST_INVALID'; end if;

  if v_phone like '258%' then v_phone:='+'||v_phone;
  elsif v_phone like '0%' and length(v_phone)=10 then v_phone:='+258'||substring(v_phone from 2);
  elsif v_phone like '8%' and length(v_phone)=9 then v_phone:='+258'||v_phone;
  else raise exception 'INVALID_PHONE'; end if;

  if p_provider='emola' and not (regexp_replace(v_phone,'[^0-9]','','g') ~ '^258(86|87)[0-9]{7}$') then
    raise exception 'EMOLA_PHONE_INVALID';
  end if;

  select * into a from public.appointments where manage_token=p_token for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments where id=a.id for update;

  if a.status<>'pending' or a.deposit_status<>'awaiting' or a.deposit_cents<=0 then
    if a.deposit_status='paid' then raise exception 'PAYMENT_ALREADY_PAID'; end if;
    raise exception 'PAYMENT_NOT_REQUIRED';
  end if;
  if a.hold_expires_at is null or a.hold_expires_at<=now() then raise exception 'BOOKING_HOLD_EXPIRED'; end if;

  select * into pa from public.payment_accounts
  where barbershop_id=a.barbershop_id and provider=p_provider and enabled=true
  for update;
  if not found then raise exception 'PAYMENT_PROVIDER_DISABLED'; end if;
  if pa.credential_secret_id is null then raise exception 'PAYMENT_PROVIDER_NOT_CONFIGURED'; end if;

  select * into p from public.payments where idempotency_key=p_idempotency_key::text limit 1;
  if found then
    if p.appointment_id is distinct from a.id then raise exception 'PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
    return query select p.id,p.provider,p.provider_ref,p.amount_cents,p.msisdn,a.hold_expires_at,true;
    return;
  end if;

  select * into p from public.payments
  where appointment_id=a.id and status='pending'
  order by created_at desc limit 1 for update;
  if found then
    if p.provider=p_provider then
      update public.payments set msisdn=v_phone,updated_at=now() where id=p.id returning * into p;
      return query select p.id,p.provider,p.provider_ref,p.amount_cents,p.msisdn,a.hold_expires_at,true;
      return;
    end if;
    update public.payments
    set status='failed',failure_code='REPLACED_BY_NEW_ATTEMPT',
        failure_reason='Cliente iniciou um método de pagamento diferente.',failed_at=now(),updated_at=now()
    where id=p.id;
  end if;

  v_payment_id:=gen_random_uuid();
  v_provider_ref:='BO-'||upper(substr(replace(v_payment_id::text,'-',''),1,24));

  insert into public.payments(
    id,barbershop_id,appointment_id,provider_account_id,provider,amount_cents,msisdn,status,provider_ref,idempotency_key
  )
  values(v_payment_id,a.barbershop_id,a.id,pa.id,p_provider,a.deposit_cents,v_phone,'pending',v_provider_ref,p_idempotency_key::text)
  returning * into p;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(a.barbershop_id,null,'payment_initiated','payment',p.id,
    jsonb_build_object('appointment_id',a.id,'provider',p.provider::text,'amount_cents',p.amount_cents));

  return query select p.id,p.provider,p.provider_ref,p.amount_cents,p.msisdn,a.hold_expires_at,false;
end;
$fn$;
revoke all on function public.init_payment_from_token(uuid,public.payment_provider,text,uuid) from public;
grant execute on function public.init_payment_from_token(uuid,public.payment_provider,text,uuid) to anon,authenticated;

create or replace function public.mark_payment_provider_started(
  p_payment uuid,p_provider_transaction_id text,p_provider_status text,p_provider_message text,p_raw jsonb default '{}'::jsonb
)
returns table(payment_id uuid,status public.payment_state,provider_ref text)
language plpgsql security definer set search_path=''
as $fn$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id=p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status<>'pending' then return query select p.id,p.status,p.provider_ref; return; end if;
  update public.payments
  set provider_transaction_id=nullif(btrim(p_provider_transaction_id),''),
      raw=coalesce(p_raw,'{}'::jsonb),failure_code=null,failure_reason=null,updated_at=now()
  where id=p.id returning * into p;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p.barbershop_id,null,'payment_provider_accepted','payment',p.id,
    jsonb_build_object('provider_status',left(coalesce(p_provider_status,''),100),'provider_message',left(coalesce(p_provider_message,''),500)));
  return query select p.id,p.status,p.provider_ref;
end;
$fn$;
revoke all on function public.mark_payment_provider_started(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_payment_provider_started(uuid,text,text,text,jsonb) to service_role;

create or replace function public.finalize_payment_event(
  p_payment uuid,p_state public.payment_state,p_provider_transaction_id text,p_provider_status text,p_provider_message text,p_raw jsonb default '{}'::jsonb
)
returns table(payment_id uuid,payment_status public.payment_state,appointment_status public.appointment_status,late_success boolean,requires_refund boolean)
language plpgsql security definer set search_path=''
as $fn$
declare
  p public.payments%rowtype;
  a public.appointments%rowtype;
  v_late boolean:=false;
begin
  if p_state not in ('paid','failed','refunded') then raise exception 'PAYMENT_STATE_INVALID'; end if;

  select * into p from public.payments where id=p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  if p.status='paid' and p_state='paid' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund; return;
  end if;
  if p.status='refunded' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund; return;
  end if;
  if p.status='failed' and p_state='failed' then
    select * into a from public.appointments where id=p.appointment_id;
    return query select p.id,p.status,a.status,false,p.requires_refund; return;
  end if;

  select * into a from public.appointments where id=p.appointment_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments where id=a.id for update;

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
        update public.appointments
        set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),
            cancel_reason=coalesce(cancel_reason,'deposit_timeout'),hold_expires_at=null
        where id=a.id;
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
        failure_code=nullif(btrim(p_provider_status),''),failure_reason=left(coalesce(p_provider_message,''),500),
        failed_at=now(),raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
    where id=p.id returning * into p;

    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(a.barbershop_id,null,'payment_failed','payment',p.id,
      jsonb_build_object('appointment_id',a.id,'provider_status',left(coalesce(p_provider_status,''),100)));
  else
    update public.payments
    set status='refunded',
        provider_transaction_id=coalesce(nullif(btrim(p_provider_transaction_id),''),provider_transaction_id),
        requires_refund=false,raw=coalesce(p_raw,'{}'::jsonb),updated_at=now()
    where id=p.id returning * into p;

    if a.deposit_status='paid' then update public.appointments set deposit_status='refunded' where id=a.id; end if;

    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(a.barbershop_id,null,'payment_refunded','payment',p.id,
      jsonb_build_object('appointment_id',a.id,'amount_cents',p.amount_cents));
  end if;

  select * into a from public.appointments where id=p.appointment_id;
  return query select p.id,p.status,a.status,v_late,p.requires_refund;
end;
$fn$;
revoke all on function public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb) to service_role;

create or replace function public.claim_payment_reconciliation(p_payment uuid,p_min_interval interval default interval '10 seconds')
returns boolean language plpgsql security definer set search_path=''
as $fn$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id=p_payment for update;
  if not found or p.status<>'pending' then return false; end if;
  if p.last_reconciled_at is not null and p.last_reconciled_at>now()-greatest(p_min_interval,interval '1 second') then return false; end if;
  update public.payments set last_reconciled_at=now(),updated_at=now() where id=p.id;
  return true;
end;
$fn$;
revoke all on function public.claim_payment_reconciliation(uuid,interval) from public,anon,authenticated;
grant execute on function public.claim_payment_reconciliation(uuid,interval) to service_role;

create or replace function public.get_payment_status_by_token(p_token uuid)
returns table(
  payment_provider public.payment_provider,
  payment_status public.payment_state,
  payment_amount_cents integer,
  payment_failure_code text,
  payment_failure_reason text,
  payment_requires_refund boolean,
  payment_updated_at timestamptz,
  hold_expires_at timestamptz
)
language sql security definer set search_path=''
as $fn$
  select p.provider,p.status,p.amount_cents,p.failure_code,p.failure_reason,p.requires_refund,p.updated_at,a.hold_expires_at
  from public.appointments a
  left join lateral (
    select x.* from public.payments x where x.appointment_id=a.id order by x.created_at desc limit 1
  ) p on true
  where a.manage_token=p_token;
$fn$;
revoke all on function public.get_payment_status_by_token(uuid) from public;
grant execute on function public.get_payment_status_by_token(uuid) to anon,authenticated;

create or replace function public.get_payments(p_shop uuid,p_status public.payment_state default null,p_limit integer default 50,p_offset integer default 0)
returns table(
  id uuid,appointment_id uuid,provider public.payment_provider,amount_cents integer,msisdn text,status public.payment_state,
  provider_ref text,provider_transaction_id text,failure_code text,failure_reason text,requires_refund boolean,
  created_at timestamptz,paid_at timestamptz,updated_at timestamptz
)
language plpgsql security definer set search_path=''
as $fn$
begin
  if p_shop is null or not (
    public.is_platform_admin()
    or public.is_member(p_shop,array['owner','manager']::public.app_role[])
  ) then raise exception 'SHOP_OPERATOR_REQUIRED'; end if;

  return query
  select p.id,p.appointment_id,p.provider,p.amount_cents,p.msisdn,p.status,p.provider_ref,p.provider_transaction_id,
         p.failure_code,p.failure_reason,p.requires_refund,p.created_at,p.paid_at,p.updated_at
  from public.payments p
  where p.barbershop_id=p_shop and (p_status is null or p.status=p_status)
  order by p.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
end;
$fn$;
revoke all on function public.get_payments(uuid,public.payment_state,integer,integer) from public,anon;
grant execute on function public.get_payments(uuid,public.payment_state,integer,integer) to authenticated;

create or replace function public.get_payment_metrics(p_shop uuid)
returns table(
  pending_count bigint,paid_count bigint,failed_count bigint,refund_count bigint,refund_required_count bigint,
  pending_amount_cents bigint,paid_amount_cents bigint
)
language plpgsql security definer set search_path=''
as $fn$
begin
  if p_shop is null or not (
    public.is_platform_admin()
    or public.is_member(p_shop,array['owner','manager']::public.app_role[])
  ) then raise exception 'SHOP_OPERATOR_REQUIRED'; end if;
  return query
  select
    count(*) filter(where p.status='pending'),
    count(*) filter(where p.status='paid'),
    count(*) filter(where p.status='failed'),
    count(*) filter(where p.status='refunded'),
    count(*) filter(where p.requires_refund),
    coalesce(sum(p.amount_cents) filter(where p.status='pending'),0),
    coalesce(sum(p.amount_cents) filter(where p.status='paid'),0)
  from public.payments p where p.barbershop_id=p_shop;
end;
$fn$;
revoke all on function public.get_payment_metrics(uuid) from public,anon;
grant execute on function public.get_payment_metrics(uuid) to authenticated;
