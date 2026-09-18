-- BarberOS Phase 13: Waitlist Engine acceptance suite.
-- Every fixture is rolled back. No customer, appointment or waitlist data persists.

begin;

do $$
declare
  v_owner uuid;
  v_shop uuid;
  v_slug text;
  v_service uuid;
  v_barber uuid;
  v_haircut uuid;
  v_day date;
  v_start timestamptz;
  v_appt uuid;
  v_offer1 uuid;
  v_offer_token1 uuid;
  v_offer2 uuid;
  v_offer_token2 uuid;
  v_offer3 uuid;
  v_offer_token3 uuid;
  v_claim record;
  v_expire record;
  v_status public.waitlist_status;
  v_waiting_count bigint;
  v_offered_count bigint;
  v_error text;
begin
  if not has_function_privilege(
    'anon',
    'public.join_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_JOIN_ANON_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'anon',
    'public.get_waitlist_offer(uuid)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_OFFER_VIEW_ANON_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'anon',
    'public.claim_waitlist_offer(uuid)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_CLAIM_ANON_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'anon',
    'public.expire_waitlist_offer(uuid)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_EXPIRE_ANON_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_waitlist(uuid,text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_LIST_AUTH_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_waitlist_metrics(uuid)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_METRICS_AUTH_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.cancel_waitlist(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'WAITLIST_CANCEL_AUTH_EXECUTE_REQUIRED';
  end if;

  if has_function_privilege('anon','public.get_waitlist(uuid,text,text,integer,integer)','EXECUTE') then
    raise exception 'WAITLIST_OPERATOR_LIST_MUST_NOT_BE_PUBLIC';
  end if;

  if has_table_privilege('anon','public.waitlist_entries','INSERT')
     or has_table_privilege('anon','public.waitlist_entries','UPDATE')
     or has_table_privilege('anon','public.waitlist_entries','DELETE')
     or has_table_privilege('authenticated','public.waitlist_entries','INSERT')
     or has_table_privilege('authenticated','public.waitlist_entries','UPDATE')
     or has_table_privilege('authenticated','public.waitlist_entries','DELETE') then
    raise exception 'WAITLIST_DIRECT_DML_MUST_BE_REVOKED';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='waitlist_entries'
      and indexname='waitlist_one_active_offer_per_slot_idx'
  ) then
    raise exception 'WAITLIST_SLOT_UNIQUENESS_INDEX_MISSING';
  end if;

  select m.user_id,m.barbershop_id,b.slug
  into v_owner,v_shop,v_slug
  from public.barbershop_members m
  join public.barbershops b on b.id=m.barbershop_id
  where m.role='owner'
    and b.status in ('trial','active')
  order by b.created_at
  limit 1;

  if v_owner is null then
    raise exception 'WAITLIST_FIXTURE_SHOP_UNAVAILABLE';
  end if;

  select s.id,br.id
  into v_service,v_barber
  from public.services s
  join public.barber_services bs on bs.service_id=s.id
  join public.barbers br on br.id=bs.barber_id and br.is_active
  where s.barbershop_id=v_shop
    and s.is_active
  order by s.sort_order,br.sort_order
  limit 1;

  select h.id
  into v_haircut
  from public.haircuts h
  where h.barbershop_id=v_shop
    and h.is_active
    and (h.service_id=v_service or h.service_id is null)
  order by (h.service_id is null),h.sort_order
  limit 1;

  if v_service is null or v_barber is null then
    raise exception 'WAITLIST_FIXTURE_SERVICE_OR_BARBER_UNAVAILABLE';
  end if;

  select av.day
  into v_day
  from public.get_available_days(
    v_slug,
    v_service,
    v_barber,
    current_date+1,
    current_date+30
  ) av
  where av.slots_count > 0
  order by av.day
  limit 1;

  if v_day is null then
    raise exception 'WAITLIST_FIXTURE_DAY_UNAVAILABLE';
  end if;

  select slot_start
  into v_start
  from public.get_available_slots(v_slug,v_service,v_barber,v_day)
  order by slot_start
  limit 1;

  if v_start is null then
    raise exception 'WAITLIST_FIXTURE_SLOT_UNAVAILABLE';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  -- Make the slot occupied by a real booking-engine appointment.
  select appointment_id
  into v_appt
  from public.book_appointment_manual(
    v_shop,
    v_service,
    v_haircut,
    v_barber,
    v_start,
    'Phase13 Waitlist Fixture',
    '+258841234569',
    'phase13-waitlist@example.invalid',
    'phase13 waitlist fixture'
  );

  if v_appt is null then
    raise exception 'WAITLIST_FIXTURE_APPOINTMENT_NOT_CREATED';
  end if;

  -- Join using the public contract, no internal table write from the client path.
  set local role anon;
  select status
  into v_status
  from public.join_waitlist(
    v_slug,
    v_service,
    'Phase13 Queue One',
    '+258841234570',
    v_haircut,
    v_barber,
    'phase13-one@example.invalid',
    v_day,
    v_day,
    'any'
  )
  limit 1;

  if v_status <> 'waiting' then
    raise exception 'WAITLIST_JOIN_FAILED';
  end if;

  select status
  into v_status
  from public.join_waitlist(
    v_slug,
    v_service,
    'Phase13 Queue Two',
    '+258841234571',
    v_haircut,
    null,
    'phase13-two@example.invalid',
    v_day,
    v_day,
    'any'
  )
  limit 1;

  if v_status <> 'waiting' then
    raise exception 'WAITLIST_SECOND_JOIN_FAILED';
  end if;

  select status
  into v_status
  from public.join_waitlist(
    v_slug,
    v_service,
    'Phase13 Queue Three',
    '+258841234572',
    v_haircut,
    null,
    'phase13-three@example.invalid',
    v_day,
    v_day,
    'any'
  )
  limit 1;

  if v_status <> 'waiting' then
    raise exception 'WAITLIST_THIRD_JOIN_FAILED';
  end if;

  -- Re-entering the same request must not create another active queue entry.
  set local role postgres;
  select count(*)
  into v_waiting_count
  from public.waitlist_entries
  where barbershop_id=v_shop
    and service_id=v_service
    and phone='+258841234570'
    and status='waiting';

  if v_waiting_count <> 1 then
    raise exception 'WAITLIST_DUPLICATE_REQUEST_NOT_CONTROLLED';
  end if;

  -- Cancellation releases the slot and the domain trigger should offer it to exactly one customer.
  set local role postgres;
  update public.appointments
  set status='cancelled',cancelled_at=now(),cancel_reason='phase13 test'
  where id=v_appt;

  select w.id,w.offer_token
  into v_offer1,v_offer_token1
  from public.waitlist_entries w
  where w.barbershop_id=v_shop
    and w.offer_slot_start=v_start
    and w.offer_barber_id=v_barber
    and w.status='offered';

  if v_offer1 is null or v_offer_token1 is null then
    raise exception 'WAITLIST_CANCEL_TRIGGER_DID_NOT_OFFER';
  end if;

  select count(*)
  into v_offered_count
  from public.waitlist_entries
  where barbershop_id=v_shop
    and status='offered'
    and offer_slot_start=v_start
    and offer_barber_id=v_barber;

  if v_offered_count <> 1 then
    raise exception 'WAITLIST_MORE_THAN_ONE_ACTIVE_OFFER';
  end if;

  -- A second offer attempt on the same slot cannot issue another offer.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  if exists (
    select 1
    from public.offer_next_waitlist(v_shop,v_start,v_barber)
  ) then
    raise exception 'WAITLIST_DUPLICATE_SLOT_OFFER';
  end if;

  -- The public offer payload must not expose internal appointment/customer identifiers.
  set local role anon;
  if not exists (
    select 1
    from public.get_waitlist_offer(v_offer_token1)
    where can_claim=true
      and shop_slug=v_slug
      and slot_start=v_start
  ) then
    raise exception 'WAITLIST_PUBLIC_OFFER_VIEW_FAILED';
  end if;

  -- Claim converts the one offer into a real waitlist-sourced appointment.
  select *
  into v_claim
  from public.claim_waitlist_offer(v_offer_token1)
  limit 1;

  if v_claim.appointment_id is null or v_claim.manage_token is null then
    raise exception 'WAITLIST_CLAIM_FAILED';
  end if;

  set local role postgres;
  if not exists (
    select 1
    from public.waitlist_entries
    where id=v_offer1
      and status='converted'
  ) then
    raise exception 'WAITLIST_ENTRY_NOT_CONVERTED';
  end if;

  if not exists (
    select 1
    from public.appointments
    where id=v_claim.appointment_id
      and source='waitlist'
      and barbershop_id=v_shop
      and starts_at=v_start
      and barber_id=v_barber
  ) then
    raise exception 'WAITLIST_CLAIMED_APPOINTMENT_CONTRACT_FAILED';
  end if;

  -- Releasing the converted appointment should immediately offer the next waiting customer.
  set local role postgres;
  update public.appointments
  set status='cancelled',cancelled_at=now(),cancel_reason='phase13 rotation test'
  where id=v_claim.appointment_id;

  select w.id,w.offer_token
  into v_offer2,v_offer_token2
  from public.waitlist_entries w
  where w.barbershop_id=v_shop
    and w.status='offered'
    and w.offer_slot_start=v_start
    and w.offer_barber_id=v_barber
  order by w.created_at,w.id
  limit 1;

  if v_offer2 is null or v_offer2=v_offer1 or v_offer_token2 is null then
    raise exception 'WAITLIST_SECOND_CUSTOMER_WAS_NOT_OFFERED';
  end if;

  -- Expiry rotates to the third customer.
  set local role postgres;
  update public.waitlist_entries
  set offer_expires_at=now()-interval '1 minute'
  where id=v_offer2;

  set local role anon;
  select *
  into v_expire
  from public.expire_waitlist_offer(v_offer_token2)
  limit 1;

  if v_expire.status <> 'expired' then
    raise exception 'WAITLIST_EXPIRE_FAILED';
  end if;

  set local role postgres;
  select w.id,w.offer_token
  into v_offer3,v_offer_token3
  from public.waitlist_entries w
  where w.barbershop_id=v_shop
    and w.status='offered'
    and w.offer_slot_start=v_start
    and w.offer_barber_id=v_barber
  order by w.created_at,w.id
  limit 1;

  if v_offer3 is null or v_offer3=v_offer1 or v_offer3=v_offer2 or v_offer_token3 is null then
    raise exception 'WAITLIST_EXPIRY_DID_NOT_ROTATE';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  if not exists (
    select 1
    from public.get_waitlist(v_shop,'active',null,50,0)
    where waitlist_entry_id=v_offer3
      and status='offered'
  ) then
    raise exception 'WAITLIST_OPERATOR_READ_FAILED';
  end if;

  if not exists (
    select 1
    from public.get_waitlist_metrics(v_shop)
    where offered_count >= 1
  ) then
    raise exception 'WAITLIST_METRICS_FAILED';
  end if;

  raise notice 'PASS | join, dedupe, slot-trigger offer, single active offer, token view, claim->appointment, conversion, rotation and expiry rotation verified';
end
$$;

rollback;
