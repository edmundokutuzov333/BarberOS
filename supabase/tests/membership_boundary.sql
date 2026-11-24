-- Actual authenticated RPC authorization, isolated synthetic tenants and rollback.
begin;
select set_config('barberos.member_owner',gen_random_uuid()::text,true);
select set_config('barberos.member_staff',gen_random_uuid()::text,true);
select set_config('barberos.member_shop',gen_random_uuid()::text,true);
select set_config('barberos.member_other_shop',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
values(current_setting('barberos.member_owner')::uuid,current_setting('barberos.member_owner')||'@example.invalid','{}'),
      (current_setting('barberos.member_staff')::uuid,current_setting('barberos.member_staff')||'@example.invalid','{}');
insert into public.barbershops(id,slug,name,status)
values(current_setting('barberos.member_shop')::uuid,'membership-'||current_setting('barberos.member_shop'),'Membership fixture','trial'),
      (current_setting('barberos.member_other_shop')::uuid,'membership-'||current_setting('barberos.member_other_shop'),'Other membership fixture','trial');
insert into public.barbershop_members(barbershop_id,user_id,role)
values(current_setting('barberos.member_shop')::uuid,current_setting('barberos.member_owner')::uuid,'owner');
select set_config('request.jwt.claim.sub',current_setting('barberos.member_owner'),true);
set local role authenticated;
do $owner$
declare v_shop uuid:=current_setting('barberos.member_shop')::uuid; v_staff uuid; v_owner uuid; denied boolean:=false;
begin
  begin
    perform public.add_member_by_email(v_shop,current_setting('barberos.member_owner')||'@example.invalid','barber');
  exception when others then if sqlerrm='LAST_OWNER' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'LAST_OWNER_DEMOTION_ALLOWED'; end if;
  select id into strict v_owner from public.list_members(v_shop) where user_id=current_setting('barberos.member_owner')::uuid;
  begin
    perform public.remove_barbershop_member(v_shop,v_owner);
    raise exception 'MEMBER_SELF_REMOVE_ALLOWED';
  exception when others then if sqlerrm<>'MEMBER_SELF_REMOVE' then raise; end if; end;
  v_staff:=public.add_member_by_email(v_shop,current_setting('barberos.member_staff')||'@example.invalid','barber');
  if public.add_member_by_email(v_shop,current_setting('barberos.member_staff')||'@example.invalid','barber')<>v_staff then raise exception 'MEMBER_ADD_REPLAY_CHANGED_ID'; end if;
  if (select count(*) from public.list_members(v_shop) where user_id=current_setting('barberos.member_staff')::uuid)<>1 then raise exception 'MEMBER_ADD_DUPLICATED'; end if;
  perform public.remove_barbershop_member(v_shop,v_staff);
  perform public.remove_barbershop_member(v_shop,v_staff);
  if exists(select 1 from public.list_members(v_shop) where user_id=current_setting('barberos.member_staff')::uuid) then raise exception 'MEMBER_REMOVE_FAILED'; end if;
  begin
    perform public.add_member_by_email(current_setting('barberos.member_other_shop')::uuid,current_setting('barberos.member_staff')||'@example.invalid','owner');
    raise exception 'MEMBER_CROSS_TENANT_ADD_ALLOWED';
  exception when others then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
end;
$owner$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.member_staff'),true);
set local role authenticated;
do $staff$
begin
  begin
    perform public.list_members(current_setting('barberos.member_shop')::uuid);
    raise exception 'MEMBER_DIRECTORY_ENUMERATION_ALLOWED';
  exception when others then if sqlerrm<>'OWNER_REQUIRED' then raise; end if; end;
end;
$staff$;
reset role;
do $audit$
begin
  if (select count(*) from public.audit_logs where barbershop_id=current_setting('barberos.member_shop')::uuid and action='member_added')<>1 then raise exception 'MEMBER_ADD_AUDIT_DUPLICATED_OR_MISSING'; end if;
  if (select count(*) from public.audit_logs where barbershop_id=current_setting('barberos.member_shop')::uuid and action='member_removed')<>1 then raise exception 'MEMBER_REMOVE_AUDIT_DUPLICATED_OR_MISSING'; end if;
end;
$audit$;
rollback;
select 'MEMBERSHIP_BOUNDARY_PASSED' as result;
