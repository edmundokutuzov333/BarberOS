-- BarberOS Phase 22: role-by-role permission acceptance suite.
-- All mutations are rolled back. Uses only existing project identities and temporary rows.

begin;

-- The permission surface is explicit before role tests.
do $$
begin
  if has_table_privilege('anon','public.profiles','select') then
    raise exception 'FAIL: anon can read profiles';
  end if;
  if has_table_privilege('anon','public.customers','select') then
    raise exception 'FAIL: anon can read customers';
  end if;
  if has_table_privilege('anon','public.services','insert') then
    raise exception 'FAIL: anon can insert services';
  end if;
  if not has_table_privilege('anon','public.services','select') then
    raise exception 'FAIL: anon cannot read public services';
  end if;

  if has_table_privilege('authenticated','public.appointments','insert') then
    raise exception 'FAIL: authenticated can insert appointments directly';
  end if;
  if has_table_privilege('authenticated','public.payments','update') then
    raise exception 'FAIL: authenticated can update payments directly';
  end if;
  if has_table_privilege('authenticated','public.notifications','update') then
    raise exception 'FAIL: authenticated can update notifications directly';
  end if;
  if has_table_privilege('authenticated','public.reviews','insert') then
    raise exception 'FAIL: authenticated can insert reviews directly';
  end if;
  if has_table_privilege('authenticated','public.waitlist_entries','update') then
    raise exception 'FAIL: authenticated can update waitlist directly';
  end if;
  if has_table_privilege('authenticated','public.barbershop_members','delete') then
    raise exception 'FAIL: authenticated can delete members directly';
  end if;
  if has_table_privilege('authenticated','public.profiles','update') then
    raise exception 'FAIL: authenticated can update profiles directly';
  end if;
  if not has_table_privilege('authenticated','public.services','update') then
    raise exception 'FAIL: authenticated lost RLS-protected service writes';
  end if;
  if not has_table_privilege('authenticated','public.barbers','update') then
    raise exception 'FAIL: authenticated lost RLS-protected barber writes';
  end if;
end $$;

-- Non-admin self elevation must be impossible.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','dcf07e72-d380-4494-a7ca-91a219efcbfb',
    'role','authenticated'
  )::text,
  true
);

do $$
begin
  begin
    update public.profiles
    set is_platform_admin = true
    where id = 'dcf07e72-d380-4494-a7ca-91a219efcbfb';
    raise exception 'SELF_ESCALATION_SUCCEEDED';
  exception when others then
    if sqlerrm = 'SELF_ESCALATION_SUCCEEDED' then
      raise;
    end if;
  end;
end $$;

do $$
begin
  begin
    perform public.admin_get_overview();
    raise exception 'ADMIN_CALL_SUCCEEDED';
  exception when others then
    if sqlerrm = 'ADMIN_CALL_SUCCEEDED' then
      raise;
    end if;
    if position('PLATFORM_ADMIN_REQUIRED' in sqlerrm) = 0 then
      raise exception 'FAIL: non-admin admin_get_overview error was %', sqlerrm;
    end if;
  end;
end $$;

-- Owner path.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','2853b0a6-b839-47dd-b475-172267089671',
    'role','authenticated'
  )::text,
  true
);

do $$
declare v_count bigint;
begin
  select count(*) into v_count
  from public.list_members('600b5ffe-62df-40e7-b122-9d6cc557d1c3');
  if v_count < 1 then
    raise exception 'FAIL: owner cannot list own team';
  end if;
  perform public.admin_get_overview();
end $$;

-- Prepare temporary Mufundisse fixtures as the database owner.
set local role postgres;
insert into public.services(barbershop_id,name,price_cents,duration_min,requires_deposit,is_active)
values ('114e44ee-987b-4046-a6a2-988f8f0784cf','PHASE22_PERMISSION_SERVICE',10000,30,false,true);

insert into public.barbers(barbershop_id,user_id,display_name,years_experience,is_active,sort_order)
values ('114e44ee-987b-4046-a6a2-988f8f0784cf','6902c55d-06d6-4d1c-8f98-ea073376493c','PHASE22_PERMISSION_BARBER',1,true,999);

update public.barbershop_members
set role='manager'
where barbershop_id='114e44ee-987b-4046-a6a2-988f8f0784cf'
  and user_id='6902c55d-06d6-4d1c-8f98-ea073376493c';

-- Manager: operational configuration + team read, no platform administration.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','6902c55d-06d6-4d1c-8f98-ea073376493c',
    'role','authenticated'
  )::text,
  true
);

do $$
declare
  v_service uuid;
  v_count bigint;
begin
  select id into v_service
  from public.services
  where barbershop_id='114e44ee-987b-4046-a6a2-988f8f0784cf'
    and name='PHASE22_PERMISSION_SERVICE';

  update public.services
  set name='PHASE22_PERMISSION_SERVICE_MANAGER_OK'
  where id=v_service;

  select count(*) into v_count
  from public.list_members('114e44ee-987b-4046-a6a2-988f8f0784cf');

  if v_count < 1 then
    raise exception 'FAIL: manager cannot list own team';
  end if;

  begin
    perform public.admin_get_overview();
    raise exception 'MANAGER_ADMIN_CALL_SUCCEEDED';
  exception when others then
    if sqlerrm = 'MANAGER_ADMIN_CALL_SUCCEEDED' then
      raise;
    end if;
    if position('PLATFORM_ADMIN_REQUIRED' in sqlerrm) = 0 then
      raise exception 'FAIL: manager admin denial was %', sqlerrm;
    end if;
  end;
end $$;

-- Barber: own barber profile read/update, no configuration administration, no team roster.
set local role postgres;
update public.barbershop_members
set role='barber'
where barbershop_id='114e44ee-987b-4046-a6a2-988f8f0784cf'
  and user_id='6902c55d-06d6-4d1c-8f98-ea073376493c';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub','6902c55d-06d6-4d1c-8f98-ea073376493c',
    'role','authenticated'
  )::text,
  true
);

do $$
declare
  v_service uuid;
  v_barber uuid;
  v_count bigint;
begin
  select id into v_service
  from public.services
  where barbershop_id='114e44ee-987b-4046-a6a2-988f8f0784cf'
    and name like 'PHASE22_PERMISSION_SERVICE%';

  begin
    update public.services
    set name='PHASE22_PERMISSION_SERVICE_BARBER_MUST_FAIL'
    where id=v_service;
    raise exception 'BARBER_SERVICE_WRITE_SUCCEEDED';
  exception when others then
    if sqlerrm = 'BARBER_SERVICE_WRITE_SUCCEEDED' then
      raise;
    end if;
  end;

  select id into v_barber
  from public.barbers
  where barbershop_id='114e44ee-987b-4046-a6a2-988f8f0784cf'
    and user_id='6902c55d-06d6-4d1c-8f98-ea073376493c'
    and display_name='PHASE22_PERMISSION_BARBER';

  update public.barbers
  set display_name='PHASE22_PERMISSION_BARBER_UPDATED'
  where id=v_barber;

  select count(*) into v_count
  from public.list_members('114e44ee-987b-4046-a6a2-988f8f0784cf');

  if v_count <> 0 then
    raise exception 'FAIL: barber can access team roster';
  end if;

  begin
    update public.barbers
    set barbershop_id='600b5ffe-62df-40e7-b122-9d6cc557d1c3'
    where id=v_barber;
    raise exception 'TENANT_REPARENT_SUCCEEDED';
  exception when others then
    if sqlerrm = 'TENANT_REPARENT_SUCCEEDED' then
      raise;
    end if;
    if position('TENANT_IMMUTABLE' in sqlerrm) = 0 then
      raise exception 'FAIL: tenant reparent denial was %', sqlerrm;
    end if;
  end;
end $$;

-- Privileged admin endpoint is not table DML and remains RPC-only.
do $$
begin
  if has_function_privilege('anon','public.admin_get_overview()','execute') then
    raise exception 'FAIL: anon can execute admin RPC';
  end if;
  if not has_function_privilege('authenticated','public.admin_get_overview()','execute') then
    raise exception 'FAIL: authenticated lost admin RPC execute grant';
  end if;
  if not has_function_privilege('authenticated','public.remove_barbershop_member(uuid,uuid)','execute') then
    raise exception 'FAIL: owner member removal RPC grant missing';
  end if;
end $$;

rollback;
