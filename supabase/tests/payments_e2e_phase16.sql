begin;

do $$
declare
  v_shop uuid;
  v_actor uuid;
  v_appt uuid;
  v_token uuid;
  v_payment record;
  v_result record;
  v_view record;
  v_account public.payment_accounts%rowtype;
begin
  select m.barbershop_id,m.user_id,a.id,a.manage_token
  into v_shop,v_actor,v_appt,v_token
  from public.barbershop_members m
  join public.appointments a on a.barbershop_id=m.barbershop_id
  where m.role='owner'
    and a.manage_token is not null
    and a.starts_at>now()+interval '2 hours'
    and not exists(select 1 from public.payments p where p.appointment_id=a.id and p.status='pending')
  order by a.starts_at,a.id
  limit 1;

  if v_appt is null then raise exception 'E2E_FIXTURE_UNAVAILABLE'; end if;

  perform public.set_payment_provider_account(
    v_actor,
    v_shop,
    'mpesa',
    true,
    'E2E-SPC',
    jsonb_build_object(
      'base_url','https://api.sandbox.vm.co.mz',
      'service_provider_code','E2E-SPC',
      'origin','*'
    ),
    jsonb_build_object(
      'api_key','E2E_ONLY_KEY',
      'public_key','E2E_ONLY_PUBLIC_KEY'
    )
  );

  update public.appointments
  set status='pending',
      deposit_status='awaiting',
      deposit_cents=600,
      hold_expires_at=now()+interval '9 minutes'
  where id=v_appt;

  select * into v_payment
  from public.init_payment_from_token(
    v_token,'mpesa','841234567','55555555-5555-4555-8555-555555555555'
  );

  if v_payment.payment_id is null or v_payment.amount_cents<>600 then
    raise exception 'E2E_PAYMENT_INIT_FAILED';
  end if;

  perform public.mark_payment_provider_started(
    v_payment.payment_id,
    'E2E-TX-01',
    'INS-0',
    'Provider accepted payment request',
    jsonb_build_object('e2e',true)
  );

  select * into v_result
  from public.finalize_payment_event(
    v_payment.payment_id,
    'paid',
    'E2E-TX-01',
    'INS-0',
    'Provider confirmed payment',
    jsonb_build_object('e2e',true)
  );

  select * into v_view
  from public.get_appointment_by_token(v_token);

  select * into v_account
  from public.payment_accounts x
  where x.barbershop_id=v_shop and x.provider='mpesa';

  if v_result.payment_status<>'paid'
     or v_result.appointment_status<>'confirmed'
     or v_view.appointment_status<>'confirmed'
     or v_view.deposit_status<>'paid'
     or v_view.latest_payment_status<>'paid'
     or v_view.hold_expires_at is not null
     or v_account.id is null then
    raise exception 'E2E_PAYMENT_CONFIRMATION_FAILED';
  end if;

  if not exists(
    select 1 from public.notifications n
    where n.appointment_id=v_appt
      and n.template_key='appointment_confirmed'
      and n.status='queued'
  ) then
    raise exception 'E2E_CONFIRMATION_NOTIFICATION_NOT_QUEUED';
  end if;
end
$$;

rollback;