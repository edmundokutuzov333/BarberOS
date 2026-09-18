-- BarberOS Phase 22: role acceptance without fixture-specific identifiers.
begin;

do $$
begin
  if has_table_privilege('anon','public.profiles','select') then raise exception 'FAIL: anon profile access'; end if;
  if has_table_privilege('anon','public.customers','select') then raise exception 'FAIL: anon customer access'; end if;
  if has_table_privilege('anon','public.services','insert') then raise exception 'FAIL: anon service insert'; end if;
  if not has_table_privilege('anon','public.services','select') then raise exception 'FAIL: anon public service read'; end if;

  if has_table_privilege('authenticated','public.appointments','insert') then raise exception 'FAIL: direct appointment insert'; end if;
  if has_table_privilege('authenticated','public.payments','update') then raise exception 'FAIL: direct payment update'; end if;
  if has_table_privilege('authenticated','public.notifications','update') then raise exception 'FAIL: direct notification update'; end if;
  if has_table_privilege('authenticated','public.reviews','insert') then raise exception 'FAIL: direct review insert'; end if;
  if has_table_privilege('authenticated','public.waitlist_entries','update') then raise exception 'FAIL: direct waitlist update'; end if;
  if has_table_privilege('authenticated','public.barbershop_members','delete') then raise exception 'FAIL: direct member delete'; end if;
  if has_table_privilege('authenticated','public.profiles','update') then raise exception 'FAIL: direct profile update'; end if;
  if not has_table_privilege('authenticated','public.services','update') then raise exception 'FAIL: tenant service update grant missing'; end if;
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',(select p.id from public.profiles p where not coalesce(p.is_platform_admin,false) order by p.created_at limit 1),
    'role','authenticated'
  )::text,true
);

do $$
begin
  begin
    update public.profiles
    set is_platform_admin=true
    where id=auth.uid();
    raise exception 'SELF_ESCALATION_SUCCEEDED';
  exception when others then
    if sqlerrm='SELF_ESCALATION_SUCCEEDED' then raise; end if;
  end;
  begin
    perform public.admin_get_overview();
    raise exception 'ADMIN_CALL_SUCCEEDED';
  exception when others then
    if sqlerrm='ADMIN_CALL_SUCCEEDED' then raise; end if;
    if position('PLATFORM_ADMIN_REQUIRED' in sqlerrm)=0 then raise exception 'FAIL: admin denial was %',sqlerrm; end if;
  end;
end $$;

set local role postgres;
insert into public.services(barbershop_id,name,price_cents,duration_min,requires_deposit,is_active)
select m.barbershop_id,'PHASE22_ACCEPTANCE_SERVICE',10000,30,false,true
from public.barbershop_members m
join public.profiles p on p.id=m.user_id
where m.role='owner' and not coalesce(p.is_platform_admin,false)
order by m.created_at
limit 1;

insert into public.barbers(barbershop_id,user_id,display_name,years_experience,is_active,sort_order)
select m.barbershop_id,m.user_id,'PHASE22_ACCEPTANCE_BARBER',1,true,999
from public.barbershop_members m
join public.profiles p on p.id=m.user_id
where m.role='owner' and not coalesce(p.is_platform_admin,false)
order by m.created_at
limit 1;

insert into public.barbershop_members(barbershop_id,user_id,role)
select m.barbershop_id,m.user_id,'manager'
from public.barbershop_members m
join public.profiles p on p.id=m.user_id
where m.role='owner' and not coalesce(p.is_platform_admin,false)
order by m.created_at
limit 0;

update public.barbershop_members m
set role='manager'
where m.user_id=(select p.id from public.profiles p where not coalesce(p.is_platform_admin,false) order by p.created_at limit 1);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',(select p.id from public.profiles p where not coalesce(p.is_platform_admin,false) order by p.created_at limit 1),
    'role','authenticated'
  )::text,true
);

do $$
declare v_service uuid; v_rows integer;
begin
  select id into v_service from public.services
  where name='PHASE22_ACCEPTANCE_SERVICE'
  limit 1;
  if v_service is null then raise exception 'FAIL: manager fixture missing'; end if;
  update public.services set name='PHASE22_ACCEPTANCE_SERVICE_MANAGER_OK' where id=v_service;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'FAIL: manager service write denied'; end if;

  begin
    perform public.admin_get_overview();
    raise exception 'MANAGER_ADMIN_CALL_SUCCEEDED';
  exception when others then
    if sqlerrm='MANAGER_ADMIN_CALL_SUCCEEDED' then raise; end if;
    if position('PLATFORM_ADMIN_REQUIRED' in sqlerrm)=0 then raise exception 'FAIL: manager admin denial was %',sqlerrm; end if;
  end;
end $$;

set local role postgres;
update public.barbershop_members m
set role='barber'
where m.user_id=(select p.id from public.profiles p where not coalesce(p.is_platform_admin,false) order by p.created_at limit 1);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',(select p.id from public.profiles p where not coalesce(p.is_platform_admin,false) order by p.created_at limit 1),
    'role','authenticated'
  )::text,true
);

do $$
declare v_service uuid; v_rows integer; v_team_rows integer;
begin
  select id into v_service from public.services where name='PHASE22_ACCEPTANCE_SERVICE_MANAGER_OK' limit 1;

  begin
    update public.services set name='PHASE22_ACCEPTANCE_SERVICE_BARBER_MUST_FAIL' where id=v_service;
    get diagnostics v_rows=row_count;
    if v_rows<>0 then raise exception 'BARBER_SERVICE_WRITE_SUCCEEDED'; end if;
  exception when others then
    if sqlerrm='BARBER_SERVICE_WRITE_SUCCEEDED' then raise; end if;
  end;

  begin
    perform public.list_members((select barbershop_id from public.barbershop_members where user_id=auth.uid() limit 1));
    raise exception 'BARBER_TEAM_READ_SUCCEEDED';
  exception when others then
    if sqlerrm='BARBER_TEAM_READ_SUCCEEDED' then raise; end if;
    if position('OWNER_REQUIRED' in sqlerrm)=0 then raise exception 'FAIL: barber team denial was %',sqlerrm; end if;
  end;
end $$;

-- The non-admin flag remains false and must survive the whole transaction.
do $$
declare v_flag boolean;
begin
  select is_platform_admin into v_flag from public.profiles where id=auth.uid();
  if coalesce(v_flag,false) then raise exception 'FAIL: non-admin escalated'; end if;
end $$;

rollback;
