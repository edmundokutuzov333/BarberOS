-- Synthetic administrator and tenant; all mutations roll back. No credential
-- reset, payment action, provider request or existing business record mutation.
begin;
select set_config('barberos.admin_fixture',gen_random_uuid()::text,true);
select set_config('barberos.regular_fixture',gen_random_uuid()::text,true);
select set_config('barberos.admin_shop',gen_random_uuid()::text,true);
select set_config('barberos.admin_plan',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
values(current_setting('barberos.admin_fixture')::uuid,current_setting('barberos.admin_fixture')||'@example.invalid','{}'),
      (current_setting('barberos.regular_fixture')::uuid,current_setting('barberos.regular_fixture')||'@example.invalid','{"is_platform_admin":true}');
update public.profiles set is_platform_admin=true where id=current_setting('barberos.admin_fixture')::uuid;
insert into public.plans(id,code,name,price_cents,max_barbers)
values(current_setting('barberos.admin_plan')::uuid,'qa-'||current_setting('barberos.admin_plan'),'Admin fixture plan',1000,10);
insert into public.barbershops(id,slug,name,status)
values(current_setting('barberos.admin_shop')::uuid,'admin-'||current_setting('barberos.admin_shop'),'Admin fixture shop','trial');
select set_config('request.jwt.claim.sub',current_setting('barberos.regular_fixture'),true);
set local role authenticated;
do $denial$
begin
  begin
    perform public.admin_get_overview();
    raise exception 'REGULAR_USER_PLATFORM_ACCESS_ALLOWED';
  exception when others then if sqlerrm<>'PLATFORM_ADMIN_REQUIRED' then raise; end if; end;
end;
$denial$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.admin_fixture'),true);
set local role authenticated;
do $admin$
declare
  v_shop uuid:=current_setting('barberos.admin_shop')::uuid;
  v_plan uuid:=current_setting('barberos.admin_plan')::uuid;
  v_admin uuid:=current_setting('barberos.admin_fixture')::uuid;
  v_ticket uuid; r record; payload jsonb;
begin
  if public.admin_get_overview() is null then raise exception 'ADMIN_OVERVIEW_EMPTY'; end if;
  select * into strict r from public.admin_list_barbershops(v_shop::text,null,10,0);
  if r.id<>v_shop or r.total_count<>1 then raise exception 'ADMIN_SHOP_SEARCH_FAILED'; end if;
  payload:=public.admin_get_barbershop(v_shop);
  if payload->'shop'->>'id'<>v_shop::text then raise exception 'ADMIN_SHOP_DETAIL_FAILED'; end if;
  perform public.admin_set_barbershop_status(v_shop,'active');
  perform public.admin_set_barbershop_status(v_shop,'active');
  if (select count(*) from public.admin_get_activity(100) a where a.entity_id=v_shop and a.action='admin_barbershop_status_changed')<>1 then raise exception 'ADMIN_STATUS_REPLAY_DUPLICATED'; end if;
  select * into strict r from public.admin_assign_barbershop_plan(v_shop,v_plan);
  if r.plan_id<>v_plan then raise exception 'ADMIN_PLAN_ASSIGNMENT_FAILED'; end if;
  select * into strict r from public.admin_update_plan(v_plan,'Updated fixture plan',2000,12,'{}',true);
  if r.price_cents<>2000 or r.max_barbers<>12 then raise exception 'ADMIN_PLAN_UPDATE_FAILED'; end if;
  if not exists(select 1 from public.admin_list_plans() p where p.id=v_plan and p.assigned_shops=1) then raise exception 'ADMIN_PLAN_LIST_FAILED'; end if;
  select * into strict r from public.admin_list_users(v_admin::text,10,0);
  if r.id<>v_admin or not r.is_platform_admin then raise exception 'ADMIN_USER_SEARCH_FAILED'; end if;
  select id into strict v_ticket from public.admin_create_support_ticket(v_shop,'Fixture support','Synthetic support lifecycle','normal');
  select * into strict r from public.admin_update_support_ticket(v_ticket,'in_progress','high',v_admin,false);
  if r.assigned_to<>v_admin or r.status<>'in_progress' then raise exception 'ADMIN_SUPPORT_ASSIGN_FAILED'; end if;
  select * into strict r from public.admin_update_support_ticket(v_ticket,'resolved',null,null,true);
  if r.assigned_to is not null or r.status<>'resolved' then raise exception 'ADMIN_SUPPORT_CLEAR_FAILED'; end if;
  if not exists(select 1 from public.admin_list_support_tickets('Fixture support',null,null,100,0) t where t.id=v_ticket and t.resolved_at is not null) then raise exception 'ADMIN_SUPPORT_LIFECYCLE_FAILED'; end if;
  payload:=public.admin_get_metrics('2035-06-14','2035-06-15');
  if jsonb_array_length(payload->'daily')<>2 then raise exception 'ADMIN_METRICS_DATE_SERIES_FAILED'; end if;
  begin
    perform public.admin_list_barbershops(null,null,0,0);
    raise exception 'ADMIN_INVALID_LIMIT_ALLOWED';
  exception when others then if sqlerrm<>'INVALID_LIMIT' then raise; end if; end;
end;
$admin$;
reset role;
do $catalog$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'admin_%'
      and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'ADMIN_FUNCTION_ANONYMOUS_EXECUTION'; end if;
  if not (select relrowsecurity from pg_class where oid='public.support_tickets'::regclass)
    or has_table_privilege('authenticated','public.support_tickets','SELECT') then raise exception 'ADMIN_SUPPORT_TABLE_EXPOSED'; end if;
end;
$catalog$;
rollback;
select 'PLATFORM_ADMIN_BOUNDARY_PASSED' as result;
