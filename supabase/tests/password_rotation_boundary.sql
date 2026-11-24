-- Real authorization behavior with transaction-scoped synthetic identities.
-- No password, email-provider request, payment or persistent customer mutation.
begin;
select set_config('barberos.test_owner',gen_random_uuid()::text,true);
select set_config('barberos.test_admin',gen_random_uuid()::text,true);
select set_config('barberos.test_shop',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
values(current_setting('barberos.test_owner')::uuid,'owner-rotation-contract@example.invalid','{}'::jsonb),
      (current_setting('barberos.test_admin')::uuid,'admin-rotation-contract@example.invalid','{}'::jsonb);
update public.profiles set password_change_required=true,
  is_platform_admin=(id=current_setting('barberos.test_admin')::uuid)
where id in(current_setting('barberos.test_owner')::uuid,current_setting('barberos.test_admin')::uuid);
insert into public.barbershops(id,name,slug,status)
values(current_setting('barberos.test_shop')::uuid,'Password rotation contract','rotation-contract-'||replace(current_setting('barberos.test_shop'),'-',''),'trial');
insert into public.barbershop_members(barbershop_id,user_id,role)
values(current_setting('barberos.test_shop')::uuid,current_setting('barberos.test_owner')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('barberos.test_owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('barberos.test_owner'),'user_metadata',jsonb_build_object('password_change_required',false,'is_platform_admin',true))::text,true);
set local role authenticated;
do $test$
declare denied boolean:=false;
begin
  begin
    perform public.get_dashboard_snapshot(current_setting('barberos.test_shop')::uuid);
  exception when others then
    if sqlerrm='PASSWORD_CHANGE_REQUIRED' then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'FORCED_OWNER_DASHBOARD_ALLOWED'; end if;
  denied:=false;
  begin
    perform public.create_barbershop('Blocked shop','rotation-blocked-'||replace(current_setting('barberos.test_shop'),'-',''),null,null);
  exception when others then
    if sqlerrm='PASSWORD_CHANGE_REQUIRED' then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'FORCED_OWNER_CREATED_SHOP'; end if;
  denied:=false;
  begin
    update public.profiles set password_change_required=false where id=auth.uid();
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'FORCED_OWNER_CLEARED_OWN_FLAG'; end if;
end;
$test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.test_admin'),true);
set local role authenticated;
do $test$
declare denied boolean:=false;
begin
  begin perform public.admin_get_overview();
  exception when others then
    if sqlerrm='PASSWORD_CHANGE_REQUIRED' then denied:=true; else raise; end if;
  end;
  if not denied then raise exception 'FORCED_ADMIN_OVERVIEW_ALLOWED'; end if;
end;
$test$;
reset role;
update public.profiles set password_change_required=false
where id in(current_setting('barberos.test_owner')::uuid,current_setting('barberos.test_admin')::uuid);
select set_config('request.jwt.claim.sub',current_setting('barberos.test_owner'),true);
set local role authenticated;
do $test$
declare created uuid; replayed uuid; created_slug text:='rotation-created-'||replace(current_setting('barberos.test_shop'),'-','');
begin
  if public.get_dashboard_snapshot(current_setting('barberos.test_shop')::uuid) is null then raise exception 'ACTIVE_OWNER_DASHBOARD_EMPTY'; end if;
  update public.profiles set full_name='Active owner' where id=auth.uid();
  if not found then raise exception 'ACTIVE_OWNER_PROFILE_UPDATE_MISSING'; end if;
  created:=public.create_barbershop('Rotation creation contract',created_slug,null,null);
  replayed:=public.create_barbershop('Rotation creation contract',created_slug,null,null);
  if created is null or replayed is distinct from created then raise exception 'ACTIVE_OWNER_SHOP_CREATION_REPLAY_FAILED'; end if;
  begin
    update public.profiles set is_platform_admin=true where id=auth.uid();
    raise exception 'ACTIVE_OWNER_SELF_PROMOTION_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.test_admin'),true);
set local role authenticated;
do $test$
begin
  if public.admin_get_overview() is null then raise exception 'ACTIVE_ADMIN_OVERVIEW_EMPTY'; end if;
end;
$test$;
reset role;
-- An authenticated identity without its authoritative profile also fails closed.
delete from public.profiles where id=current_setting('barberos.test_owner')::uuid;
select set_config('request.jwt.claim.sub',current_setting('barberos.test_owner'),true);
set local role authenticated;
do $test$
declare denied boolean:=false;
begin
  begin perform public.get_dashboard_snapshot(current_setting('barberos.test_shop')::uuid);
  exception when others then if sqlerrm='PASSWORD_CHANGE_REQUIRED' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'MISSING_PROFILE_OWNER_ALLOWED'; end if;
  denied:=false;
  begin perform public.create_barbershop('Missing profile shop','rotation-missing-'||replace(current_setting('barberos.test_shop'),'-',''),null,null);
  exception when others then if sqlerrm='PASSWORD_CHANGE_REQUIRED' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'MISSING_PROFILE_SHOP_CREATION_ALLOWED'; end if;
end;
$test$;
reset role;
rollback;
select 'PASSWORD_ROTATION_BOUNDARY_PASSED' as result;
