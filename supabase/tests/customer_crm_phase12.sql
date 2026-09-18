-- BarberOS Phase 12: Customer CRM acceptance suite.
-- All customer fixtures are rolled back inside this transaction.
-- The test uses an existing owner/shop fixture from the live database and never inserts fake data outside the rollback.

begin;

do $$
declare
  v_owner uuid;
  v_shop uuid;
  v_other_shop uuid;
  v_service uuid;
  v_barber uuid;
  v_haircut uuid;
  v_slug text;
  v_day date;
  v_start timestamptz;
  v_customer uuid;
  v_appt uuid;
  v_price_cents integer;
  v_needs_payment boolean;
  v_customer_visits integer;
  v_last_visit timestamptz;
  v_last_service text;
  v_total_spend bigint;
  v_completed bigint;
  v_conflict_customer uuid;
  v_search_count bigint;
  v_detail_name text;
  v_detail_phone text;
  v_detail_notes text;
  v_detail_tags jsonb;
  v_history_count bigint;
  v_error text;
begin
  if not has_function_privilege(
    'authenticated',
    'public.get_customer_metrics(uuid)',
    'EXECUTE'
  ) then
    raise exception 'CRM_METRICS_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_customers(uuid,text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'CRM_LIST_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_customer(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'CRM_DETAIL_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_customer_appointments(uuid,uuid,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'CRM_HISTORY_EXECUTE_REQUIRED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.update_customer(uuid,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'CRM_UPDATE_EXECUTE_REQUIRED';
  end if;

  if has_function_privilege('anon','public.get_customers(uuid,text,text,integer,integer)','EXECUTE') then
    raise exception 'ANON_CRM_LIST_MUST_BE_DENIED';
  end if;

  if has_function_privilege('anon','public.get_customer(uuid,uuid)','EXECUTE') then
    raise exception 'ANON_CRM_DETAIL_MUST_BE_DENIED';
  end if;

  if has_function_privilege('anon','public.update_customer(uuid,uuid,text,text,text,text,jsonb)','EXECUTE') then
    raise exception 'ANON_CRM_UPDATE_MUST_BE_DENIED';
  end if;

  if has_table_privilege('authenticated','public.customers','INSERT')
     or has_table_privilege('authenticated','public.customers','UPDATE')
     or has_table_privilege('authenticated','public.customers','DELETE') then
    raise exception 'DIRECT_CUSTOMER_DML_MUST_BE_REVOKED';
  end if;

  select m.user_id,m.barbershop_id
  into v_owner,v_shop
  from public.barbershop_members m
  join public.barbershops b on b.id=m.barbershop_id
  where m.role='owner'
    and b.status in ('trial','active')
  order by b.created_at
  limit 1;

  if v_owner is null or v_shop is null then
    raise exception 'CRM_FIXTURE_SHOP_UNAVAILABLE';
  end if;

  select b.id
  into v_other_shop
  from public.barbershops b
  where b.id <> v_shop
  order by b.created_at
  limit 1;

  select s.id, br.id, b.slug
  into v_service,v_barber,v_slug
  from public.barbershops b
  join public.services s on s.barbershop_id=b.id and s.is_active
  join public.barber_services bs on bs.service_id=s.id
  join public.barbers br on br.id=bs.barber_id and br.is_active
  where b.id=v_shop
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

  select gd.day
  into v_day
  from public.get_available_days(
    v_slug,v_service,v_barber,current_date,current_date+30
  ) gd
  where gd.is_open
    and gd.slots_count > 0
  order by gd.day
  limit 1;

  if v_day is not null then
    select gs.slot_start
    into v_start
    from public.get_available_slots(v_slug,v_service,v_barber,v_day) gs
    order by gs.slot_start
    limit 1;
  end if;

  if v_service is null or v_barber is null then
    raise exception 'CRM_FIXTURE_SERVICE_OR_BARBER_UNAVAILABLE';
  end if;

  insert into public.customers(
    barbershop_id,name,phone,email,notes,preferences
  )
  values (
    v_shop,
    'Phase12 CRM Fixture',
    '+258841234561',
    'phase12-crm@example.invalid',
    'nota inicial',
    '{"tags":["cliente novo","preferência"]}'::jsonb
  )
  returning id into v_customer;

  insert into public.customers(
    barbershop_id,name,phone,email
  )
  values (
    v_shop,
    'Phase12 CRM Conflict',
    '+258841234562',
    'phase12-crm-conflict@example.invalid'
  )
  returning id into v_conflict_customer;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  if not exists (
    select 1
    from public.get_customer_metrics(v_shop)
    where total_customers >= 2
  ) then
    raise exception 'CRM_METRICS_FAILED';
  end if;

  select count(*)
  into v_search_count
  from public.get_customers(
    v_shop,
    'Phase12 CRM',
    'all',
    50,
    0
  );

  if v_search_count < 2 then
    raise exception 'CRM_SEARCH_FAILED';
  end if;

  if not exists (
    select 1
    from public.get_customers(v_shop,null,'never_visited',50,0)
    where customer_id=v_customer
  ) then
    raise exception 'CRM_NEVER_VISITED_FILTER_FAILED';
  end if;

  select customer_id,name,phone,notes,preferences
  into v_customer,v_detail_name,v_detail_phone,v_detail_notes,v_detail_tags
  from public.get_customer(v_shop,v_customer);

  if v_detail_name <> 'Phase12 CRM Fixture'
     or v_detail_phone <> '+258841234561'
     or v_detail_notes <> 'nota inicial'
     or v_detail_tags->'tags' <> '["cliente novo","preferência"]'::jsonb then
    raise exception 'CRM_DETAIL_FAILED';
  end if;

  select total_count
  into v_history_count
  from public.get_customer_appointments(v_shop,v_customer,25,0)
  limit 1;

  if coalesce(v_history_count,0) <> 0 then
    raise exception 'CRM_EMPTY_HISTORY_EXPECTED';
  end if;



  if v_start is null then
    raise exception 'CRM_BOOKING_FIXTURE_SLOT_UNAVAILABLE';
  end if;

  select appointment_id,needs_payment
  into v_appt,v_needs_payment
  from public.book_appointment_manual(
    v_shop,
    v_service,
    v_haircut,
    v_barber,
    v_start,
    'Phase12 CRM integration',
    '+258841234561',
    'phase12-crm@example.invalid',
    'phase12 integration'
  );

  select price_cents
  into v_price_cents
  from public.appointments
  where id=v_appt
    and customer_id=v_customer
    and barbershop_id=v_shop;

  if v_appt is null or v_price_cents is null then
    raise exception 'CRM_BOOKING_DID_NOT_ATTACH_CUSTOMER';
  end if;

  set local role postgres;
  update public.appointments
  set status='completed'
  where id=v_appt
    and barbershop_id=v_shop;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,
    true
  );

  select visits_count,last_visit_at,last_service_name,total_spend_cents,completed_appointments
  into v_customer_visits,v_last_visit,v_last_service,v_total_spend,v_completed
  from public.get_customer(v_shop,v_customer);

  if v_customer_visits < 1
     or v_last_visit is null
     or v_last_service is null
     or v_total_spend <> v_price_cents
     or v_completed < 1 then
    raise exception 'CRM_BOOKING_HISTORY_INTEGRATION_FAILED';
  end if;

  if not exists (
    select 1
    from public.get_customer_appointments(v_shop,v_customer,50,0) h
    where h.appointment_id=v_appt
      and h.status='completed'
      and h.service_name is not null
      and h.barber_name is not null
      and h.price_cents=v_price_cents
  ) then
    raise exception 'CRM_APPOINTMENT_HISTORY_NOT_FOUND';
  end if;

  begin
    perform public.get_customers(v_shop,null,'invalid_view',50,0);
    raise exception 'INVALID_CUSTOMER_VIEW_NOT_REJECTED';
  exception
    when others then
      v_error := sqlerrm;
  end;

  if position('INVALID_CUSTOMER_VIEW' in coalesce(v_error,'')) = 0 then
    raise exception 'INVALID_CUSTOMER_VIEW_CONTRACT_FAILED: %',v_error;
  end if;

  select name,phone,notes
  into v_detail_name,v_detail_phone,v_detail_notes
  from public.update_customer(
    v_shop,
    v_customer,
    'Phase12 CRM Updated',
    '841234563',
    'updated@example.invalid',
    'nota actualizada',
    '{"tags":["VIP","corte clássico"],"source":"crm"}'::jsonb
  );

  if v_detail_name <> 'Phase12 CRM Updated'
     or v_detail_phone <> '+258841234563'
     or v_detail_notes <> 'nota actualizada' then
    raise exception 'CRM_UPDATE_FAILED';
  end if;

  v_error := null;
  begin
    perform public.update_customer(
      v_shop,
      v_customer,
      'Phase12 CRM Updated',
      '841234562',
      'updated@example.invalid',
      'nota actualizada',
      '{"tags":["VIP"]}'::jsonb
    );
    v_error := 'SUCCESS';
  exception
    when others then
      v_error := sqlerrm;
  end;

  if v_error='SUCCESS' then
    raise exception 'CRM_PHONE_UNIQUENESS_NOT_ENFORCED';
  end if;

  if position('CUSTOMER_PHONE_TAKEN' in coalesce(v_error,'')) = 0 then
    raise exception 'CRM_PHONE_CONFLICT_CONTRACT_FAILED: %',v_error;
  end if;

  if v_other_shop is not null then
    v_error := null;
    begin
      perform public.get_customer(v_other_shop,v_customer);
      v_error := 'SUCCESS';
    exception
      when others then
        v_error := sqlerrm;
    end;

    if v_error='SUCCESS' then
      raise exception 'CRM_CROSS_TENANT_READ_NOT_BLOCKED';
    end if;

    if position('CUSTOMER_NOT_FOUND' in coalesce(v_error,'')) = 0 then
      raise exception 'CRM_CROSS_TENANT_ERROR_CONTRACT_FAILED: %',v_error;
    end if;
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where barbershop_id=v_shop
      and entity='customer'
      and entity_id=v_customer
      and action='customer_updated'
  ) then
    raise exception 'CRM_AUDIT_LOG_MISSING';
  end if;

  raise notice 'PASS | crm rpc boundaries, search, filters, detail, history, update, phone uniqueness, tenant isolation and audit verified';
end
$$;

rollback;

select
  has_table_privilege('authenticated','public.customers','INSERT') as auth_insert_denied,
  has_table_privilege('authenticated','public.customers','UPDATE') as auth_update_denied,
  has_table_privilege('authenticated','public.customers','DELETE') as auth_delete_denied;
