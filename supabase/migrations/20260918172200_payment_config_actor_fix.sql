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
