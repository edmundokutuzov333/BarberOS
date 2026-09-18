-- BarberOS Phase 22 acceptance tests.
-- All fixtures are temporary and are rolled back at the end.

begin;

do $phase22$
declare
  v_shop uuid;
  v_other_shop uuid;
  v_actor uuid;
  v_admin uuid;
  v_slug text;
  v_barber uuid;
  v_customer_own uuid;
  v_customer_other uuid;
  v_service uuid;
  v_appointment uuid;
  v_count bigint;
  v_error text;
begin
  select s.id into v_shop from public.barbershops s order by s.created_at limit 1;
  select s.id into v_other_shop from public.barbershops s where s.id<>v_shop order by s.created_at limit 1;

  if v_shop is null or v_other_shop is null then
    raise exception 'PHASE22_REQUIRES_TWO_SHOPS';
  end if;

  select m.user_id into v_actor
  from public.barbershop_members m
  join public.profiles p on p.id=m.user_id
  where m.barbershop_id<>v_shop
    and not p.is_platform_admin
    and not exists (
      select 1 from public.barbershop_members x
      where x.barbershop_id=v_shop and x.user_id=m.user_id
    )
  limit 1;

  if v_actor is null then
    select p.id into v_actor
    from public.profiles p
    where not p.is_platform_admin
      and not exists (
        select 1 from public.barbershop_members x
        where x.barbershop_id=v_shop and x.user_id=p.id
      )
    limit 1;
  end if;

  if v_actor is null then
    raise exception 'PHASE22_NONADMIN_ACTOR_UNAVAILABLE';
  end if;

  select p.id into v_admin from public.profiles p where p.is_platform_admin limit 1;
  if v_admin is null then raise exception 'PHASE22_PLATFORM_ADMIN_UNAVAILABLE'; end if;

  select s.slug into v_slug from public.barbershops s where s.id=v_shop;

  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  perform public.get_public_barbershop(v_slug);
  reset role;

  insert into public.barbershop_members(barbershop_id,user_id,role)
  values(v_shop,v_actor,'owner');

  select id into v_service
  from public.services
  where barbershop_id=v_shop and is_active
  order by sort_order,name
  limit 1;

  if v_service is null then raise exception 'PHASE22_SERVICE_FIXTURE_UNAVAILABLE'; end if;

  insert into public.barbers(barbershop_id,user_id,display_name,is_active)
  values(v_shop,v_actor,'Phase 22 QA Barber',true)
  returning id into v_barber;

  insert into public.customers(barbershop_id,name,phone)
  values(v_shop,'Phase 22 QA Own',format('+25884%s',substr(replace(gen_random_uuid()::text,'-',''),1,7)))
  returning id into v_customer_own;

  insert into public.customers(barbershop_id,name,phone)
  values(v_shop,'Phase 22 QA Other',format('+25884%s',substr(replace(gen_random_uuid()::text,'-',''),1,7)))
  returning id into v_customer_other;

  insert into public.appointments(
    barbershop_id,barber_id,service_id,customer_id,starts_at,ends_at,
    duration_min,price_cents,status,source,created_by
  )
  values(
    v_shop,v_barber,v_service,v_customer_own,
    timestamptz '2099-01-01 10:00:00+00',
    timestamptz '2099-01-01 10:30:00+00',
    30,0,'confirmed','manual',v_actor
  )
  returning id into v_appointment;

  if has_table_privilege('anon','public.customers','SELECT') then raise exception 'ANON_DIRECT_CUSTOMERS_SELECT_BREACHED'; end if;
  if has_table_privilege('anon','public.appointments','SELECT') then raise exception 'ANON_DIRECT_APPOINTMENTS_SELECT_BREACHED'; end if;
  if has_table_privilege('anon','public.services','INSERT') then raise exception 'ANON_DIRECT_SERVICES_INSERT_BREACHED'; end if;
  if has_table_privilege('authenticated','public.appointments','INSERT') then raise exception 'AUTH_DIRECT_APPOINTMENT_INSERT_BREACHED'; end if;
  if has_table_privilege('authenticated','public.notifications','SELECT') then raise exception 'AUTH_DIRECT_NOTIFICATIONS_SELECT_BREACHED'; end if;

  if not has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE') then raise exception 'ANON_BOOKING_RPC_MISSING'; end if;
  if not has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','EXECUTE') then raise exception 'ANON_AVAILABILITY_RPC_MISSING'; end if;
  if not has_function_privilege('authenticated','public.get_dashboard_snapshot(uuid)','EXECUTE') then raise exception 'AUTH_DASHBOARD_RPC_MISSING'; end if;
  if has_function_privilege('authenticated','public.claim_notifications(integer)','EXECUTE') then raise exception 'CLIENT_NOTIFICATION_CLAIM_EXPOSED'; end if;
  if has_function_privilege('authenticated','public.finalize_payment_event(uuid,public.payment_state,text,text,text,jsonb)','EXECUTE') then raise exception 'CLIENT_PAYMENT_FINALIZE_EXPOSED'; end if;
  if has_function_privilege('authenticated','public.is_member(uuid,public.app_role[])','EXECUTE') then raise exception 'CLIENT_INTERNAL_ROLE_HELPER_EXPOSED'; end if;

  -- Owner
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform public.list_members(v_shop);
  perform public.get_dashboard_snapshot(v_shop);

  v_error := null;
  begin
    perform public.get_dashboard_snapshot(v_other_shop);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'SHOP_OPERATOR_REQUIRED' then raise exception 'CROSS_TENANT_OWNER_ACCESS_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  reset role;
  update public.barbershop_members set role='manager' where barbershop_id=v_shop and user_id=v_actor;

  -- Manager
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  select count(*) into v_count from public.barbershop_members where barbershop_id=v_shop;
  if v_count<>1 then raise exception 'MANAGER_TEAM_ENUMERATION_BREACHED'; end if;
  perform public.get_dashboard_snapshot(v_shop);
  perform public.get_agenda_appointments(v_shop,timestamptz '2099-01-01 00:00:00+00',timestamptz '2099-01-02 00:00:00+00');
  perform public.get_payments(v_shop,null,10,0);

  v_error := null;
  begin
    perform public.list_members(v_shop);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'OWNER_REQUIRED' then raise exception 'MANAGER_LIST_MEMBERS_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  reset role;
  update public.barbershop_members set role='barber' where barbershop_id=v_shop and user_id=v_actor;

  -- Barber
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  select count(*) into v_count from public.barbers where barbershop_id=v_shop and id=v_barber;
  if v_count<>1 then raise exception 'BARBER_OWN_PROFILE_NOT_VISIBLE'; end if;
  select count(*) into v_count from public.barbers where barbershop_id=v_shop and id<>v_barber;
  if v_count<>0 then raise exception 'BARBER_OTHER_PROFILES_VISIBLE'; end if;

  select count(*) into v_count from public.customers where id=v_customer_own;
  if v_count<>1 then raise exception 'BARBER_OWN_CUSTOMER_NOT_VISIBLE'; end if;
  select count(*) into v_count from public.customers where id=v_customer_other;
  if v_count<>0 then raise exception 'BARBER_UNRELATED_CUSTOMER_VISIBLE'; end if;

  select count(*) into v_count from public.appointments where id=v_appointment;
  if v_count<>1 then raise exception 'BARBER_OWN_APPOINTMENT_NOT_VISIBLE'; end if;
  select count(*) into v_count from public.appointments where barbershop_id=v_shop and id<>v_appointment;
  if v_count<>0 then raise exception 'BARBER_OTHER_APPOINTMENTS_VISIBLE'; end if;

  select count(*) into v_count from public.waitlist_entries where barbershop_id=v_shop;
  if v_count<>0 then raise exception 'BARBER_WAITLIST_DIRECT_READ_BREACHED'; end if;

  perform public.get_agenda_appointments(v_shop,timestamptz '2099-01-01 00:00:00+00',timestamptz '2099-01-02 00:00:00+00');
  perform public.get_customers(v_shop,null,'all',50,0);
  perform public.get_reviews(v_shop,null,null,'all',50,0);
  perform public.get_report_summary(v_shop,date '2099-01-01',date '2099-01-02',null);

  v_error := null;
  begin
    perform public.get_waitlist(v_shop,'active',null,50,0);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'SHOP_OPERATOR_REQUIRED' then raise exception 'BARBER_WAITLIST_RPC_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  v_error := null;
  begin
    perform public.get_payments(v_shop,null,10,0);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'SHOP_OPERATOR_REQUIRED' then raise exception 'BARBER_PAYMENT_RPC_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  v_error := null;
  begin
    perform public.get_notification_metrics(v_shop);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'SHOP_OPERATOR_REQUIRED' then raise exception 'BARBER_NOTIFICATION_RPC_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  v_error := null;
  begin
    perform public.list_members(v_shop);
  exception when others then
    get stacked diagnostics v_error=message_text;
  end;
  if coalesce(v_error,'')<>'OWNER_REQUIRED' then raise exception 'BARBER_LIST_MEMBERS_BREACHED: %',coalesce(v_error,'NO_ERROR'); end if;

  -- Platform admin
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform public.admin_get_overview();
  reset role;
end;
$phase22$;

rollback;
