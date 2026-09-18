-- BarberOS Phase 16 patch: qualify provider columns that overlap PL/pgSQL output variables.
-- BarberOS Phase 16 patch: service-side payment configuration must validate
-- the explicit actor rather than relying on auth.uid(), because the caller is
-- intentionally the service-role Edge Function.

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
  v_allowed boolean:=false;
  v_platform boolean:=false;
begin
  select coalesce(p.is_platform_admin,false)
  into v_platform
  from public.profiles p
  where p.id=p_actor;

  select exists(
    select 1 from public.barbershop_members m
    where m.barbershop_id=p_shop
      and m.user_id=p_actor
      and m.role in ('owner','manager')
  )
  into v_allowed;

  if not v_allowed and not v_platform then raise exception 'SHOP_OPERATOR_REQUIRED'; end if;

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
      if coalesce(trim(v_credentials->>'api_key'),'')='' or coalesce(trim(v_credentials->>'public_key'),'')='' then raise exception 'MPESA_CREDENTIALS_INCOMPLETE'; end if;
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
      if coalesce(trim(v_credentials->>'username'),'')='' or coalesce(trim(v_credentials->>'password'),'')='' or coalesce(trim(v_credentials->>'api_key'),'')='' then
        raise exception 'EMOLA_CREDENTIALS_INCOMPLETE';
      end if;
      v_credentials:=jsonb_build_object('username',v_credentials->>'username','password',v_credentials->>'password','api_key',v_credentials->>'api_key');
    else v_credentials:='{}'::jsonb; end if;
  else raise exception 'PAYMENT_PROVIDER_INVALID'; end if;

  select * into a from public.payment_accounts where barbershop_id=p_shop and provider=p_provider for update;

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
    a.webhook_secret_id:=vault.create_secret(v_token,v_webhook_name,'BarberOS per-account payment webhook capability token');
    update public.payment_accounts set webhook_secret_id=a.webhook_secret_id where id=a.id;
  end if;

  if v_credentials<>'{}'::jsonb then
    if a.credential_secret_id is null then
      a.credential_secret_id:=vault.create_secret(v_credentials::text,v_secret_name,'BarberOS encrypted payment provider credentials');
    else
      perform vault.update_secret(a.credential_secret_id,v_credentials::text,v_secret_name,'BarberOS encrypted payment provider credentials');
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


create or replace function public.find_payment_by_provider_ref(
  p_provider public.payment_provider,
  p_provider_ref text,
  p_account uuid
)
returns table(payment_id uuid,appointment_id uuid,barbershop_id uuid,amount_cents integer,status public.payment_state,provider_ref text,msisdn text)
language sql security definer set search_path=''
as $fn$
  select x.id,x.appointment_id,x.barbershop_id,x.amount_cents,x.status,x.provider_ref,x.msisdn
  from public.payments x
  where x.provider=p_provider
    and x.provider_ref=p_provider_ref
    and x.provider_account_id=p_account
  limit 1;
$fn$;
revoke all on function public.find_payment_by_provider_ref(public.payment_provider,text,uuid) from public,anon,authenticated;
grant execute on function public.find_payment_by_provider_ref(public.payment_provider,text,uuid) to service_role;
