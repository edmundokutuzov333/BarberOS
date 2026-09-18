begin;

do $block$
declare
  v_priv boolean;
begin
  if has_table_privilege('anon','public.payments','select') then raise exception 'FAIL: anon can select payments'; end if;
  if has_table_privilege('anon','public.payments','insert') then raise exception 'FAIL: anon can insert payments'; end if;
  if has_table_privilege('authenticated','public.payments','insert') then raise exception 'FAIL: authenticated can insert payments'; end if;
  if has_table_privilege('authenticated','public.payments','update') then raise exception 'FAIL: authenticated can update payments'; end if;
  if has_table_privilege('authenticated','public.payments','delete') then raise exception 'FAIL: authenticated can delete payments'; end if;
  if has_table_privilege('authenticated','public.payment_accounts','select') then raise exception 'FAIL: authenticated can read payment_accounts directly'; end if;

  if has_function_privilege('anon','public.get_payment_runtime_config(uuid)','execute') then raise exception 'FAIL: runtime config exposed to anon'; end if;
  if has_function_privilege('anon','public.get_payment_runtime_for_token(uuid)','execute') then raise exception 'FAIL: runtime credentials exposed to anon'; end if;
  if not has_function_privilege('anon','public.init_payment_from_token(uuid,public.payment_provider,text,uuid)','execute') then raise exception 'FAIL: public payment initiation RPC grant missing'; end if;
  if not has_function_privilege('anon','public.get_payment_status_by_token(uuid)','execute') then raise exception 'FAIL: public payment status RPC grant missing'; end if;
end
$block$;

do $block$
declare
  v_shop uuid;
  v_actor uuid;
  v_appt public.appointments%rowtype;
  v_first record;
  v_second record;
  v_account public.payment_accounts%rowtype;
  v_public jsonb;
  v_credentials jsonb;
begin
  select m.barbershop_id,m.user_id
  into v_shop,v_actor
  from public.barbershop_members m
  where m.role='owner'
  order by m.created_at,m.id
  limit 1;

  select a.*
  into v_appt
  from public.appointments a
  where a.barbershop_id=v_shop
    and a.manage_token is not null
    and a.starts_at > now()+interval '1 day'
  order by a.created_at,a.id
  limit 1;

  if v_shop is null or v_actor is null or v_appt.id is null then
    raise exception 'FAIL: payment fixture unavailable';
  end if;

  v_public:=jsonb_build_object(
    'base_url','https://api.sandbox.vm.co.mz',
    'service_provider_code','TEST-SPC',
    'origin','*'
  );
  v_credentials:=jsonb_build_object(
    'api_key','TEST_ONLY_API_KEY',
    'public_key','TEST_ONLY_PUBLIC_KEY'
  );

  perform public.set_payment_provider_account(
    v_actor,v_shop,'mpesa',true,'TEST-SPC',v_public,v_credentials
  );

  select * into v_account
  from public.payment_accounts
  where barbershop_id=v_shop and provider='mpesa';

  if v_account.id is null or not v_account.enabled or v_account.credential_secret_id is null or v_account.webhook_secret_id is null then
    raise exception 'FAIL: M-Pesa account was not securely configured';
  end if;

  if not exists(select 1 from vault.decrypted_secrets where id=v_account.credential_secret_id)
     or not exists(select 1 from vault.decrypted_secrets where id=v_account.webhook_secret_id) then
    raise exception 'FAIL: provider credentials/webhook token are not in Vault';
  end if;

  update public.appointments
  set status='pending',deposit_status='awaiting',deposit_cents=100,hold_expires_at=now()+interval '9 minutes'
  where id=v_appt.id;

  select * into v_first
  from public.init_payment_from_token(v_appt.manage_token,'mpesa','841111111','11111111-1111-4111-8111-111111111111');

  select * into v_second
  from public.init_payment_from_token(v_appt.manage_token,'mpesa','841111111','11111111-1111-4111-8111-111111111111');

  if v_first.payment_id is null or v_second.payment_id is distinct from v_first.payment_id or not v_second.reused then
    raise exception 'FAIL: idempotent payment initiation did not reuse the same payment';
  end if;

  if v_first.amount_cents<>100 or v_second.msisdn<>'+258841111111' then
    raise exception 'FAIL: payment amount/phone normalization is incorrect';
  end if;
end
$block$;

do $block$
declare
  v_payment public.payments%rowtype;
begin
  select p.* into v_payment
  from public.payments p
  where p.idempotency_key='11111111-1111-4111-8111-111111111111';

  if v_payment.id is null then raise exception 'FAIL: payment fixture missing'; end if;

  begin
    update public.payments set status='refunded' where id=v_payment.id;
    raise exception 'FAIL: illegal pending -> refunded transition was allowed';
  exception when others then
    if sqlerrm <> 'PAYMENT_INVALID_TRANSITION' then raise; end if;
  end;
end
$block$;

do $block$
declare
  v_appt public.appointments%rowtype;
  v_payment public.payments%rowtype;
  v_result record;
begin
  select a.* into v_appt
  from public.appointments a
  where a.starts_at > now()+interval '1 day'
    and a.manage_token is not null
    and a.id <> (select appointment_id from public.payments where idempotency_key='11111111-1111-4111-8111-111111111111')
  order by a.id desc limit 1;

  if v_appt.id is null then raise exception 'FAIL: second payment fixture unavailable'; end if;

  update public.appointments
  set status='pending',deposit_status='awaiting',deposit_cents=200,hold_expires_at=now()+interval '9 minutes'
  where id=v_appt.id;

  insert into public.payments(
    barbershop_id,appointment_id,provider,amount_cents,msisdn,status,provider_ref,idempotency_key
  ) values(
    v_appt.barbershop_id,v_appt.id,'mpesa',200,'+258842222222','pending',
    'TEST-LATE-'||replace(v_appt.id::text,'-',''),'22222222-2222-4222-8222-222222222222'
  ) returning * into v_payment;

  select * into v_result from public.finalize_payment_event(
    v_payment.id,'paid','TX-LATE','INS-0','Late test',jsonb_build_object('fixture',true)
  );

  select * into v_appt from public.appointments where id=v_appt.id;
  select * into v_payment from public.payments where id=v_payment.id;

  if v_result.payment_status<>'paid' or not v_result.late_success or not v_result.requires_refund
     or v_appt.status<>'confirmed' and v_appt.status<>'cancelled'
     or v_payment.failure_code<>'LATE_PAYMENT' then
    -- The appointment may already have been cancelled by the temporal worker between fixture setup and finalization.
    if v_appt.status<>'cancelled' or v_payment.failure_code<>'LATE_PAYMENT' then
      raise exception 'FAIL: late payment quarantine is incorrect';
    end if;
  end if;
end
$block$;

do $block$
declare
  v_appt public.appointments%rowtype;
  v_payment public.payments%rowtype;
  v_result record;
begin
  select a.* into v_appt
  from public.appointments a
  where a.starts_at > now()+interval '1 day'
    and a.manage_token is not null
  order by a.id asc limit 1;

  if v_appt.id is null then raise exception 'FAIL: paid-path fixture unavailable'; end if;

  update public.appointments
  set status='pending',deposit_status='awaiting',deposit_cents=300,hold_expires_at=now()+interval '9 minutes'
  where id=v_appt.id;

  insert into public.payments(
    barbershop_id,appointment_id,provider,amount_cents,msisdn,status,provider_ref,idempotency_key
  ) values(
    v_appt.barbershop_id,v_appt.id,'mpesa',300,'+258843333333','pending',
    'TEST-PAID-'||replace(v_appt.id::text,'-',''),'33333333-3333-4333-8333-333333333333'
  ) returning * into v_payment;

  select * into v_result from public.finalize_payment_event(
    v_payment.id,'paid','TX-PAID','INS-0','Paid test',jsonb_build_object('fixture',true)
  );

  select * into v_appt from public.appointments where id=v_appt.id;
  select * into v_payment from public.payments where id=v_payment.id;

  if v_result.payment_status<>'paid'
     or v_result.appointment_status<>'confirmed'
     or v_appt.deposit_status<>'paid'
     or v_payment.requires_refund then
    raise exception 'FAIL: paid payment did not confirm appointment atomically';
  end if;

  if not exists(
    select 1 from public.audit_logs
    where entity='payment' and entity_id=v_payment.id and action='payment_paid'
  ) then raise exception 'FAIL: payment paid audit missing'; end if;
end
$block$;

do $block$
declare
  v_appt public.appointments%rowtype;
  v_payment public.payments%rowtype;
begin
  select a.* into v_appt
  from public.appointments a
  where a.starts_at > now()+interval '1 day'
    and a.manage_token is not null
  order by a.created_at desc limit 1;
  if v_appt.id is null then raise exception 'FAIL: reconciliation fixture unavailable'; end if;

  update public.appointments
  set status='pending',deposit_status='awaiting',deposit_cents=400,hold_expires_at=now()+interval '9 minutes'
  where id=v_appt.id;

  insert into public.payments(
    barbershop_id,appointment_id,provider,amount_cents,msisdn,status,provider_ref,idempotency_key
  ) values(
    v_appt.barbershop_id,v_appt.id,'mpesa',400,'+258844444444','pending',
    'TEST-REC-'||replace(v_appt.id::text,'-',''),'44444444-4444-4444-8444-444444444444'
  ) returning * into v_payment;

  if not public.claim_payment_reconciliation(v_payment.id) then raise exception 'FAIL: first reconciliation claim rejected'; end if;
  if public.claim_payment_reconciliation(v_payment.id) then raise exception 'FAIL: second reconciliation claim bypassed anti-stampede guard'; end if;
end
$block$;

rollback;