-- A real owner of two synthetic tenants must still be unable to reparent data.
begin;
select set_config('barberos.tenant_owner',gen_random_uuid()::text,true);
select set_config('barberos.tenant_a',gen_random_uuid()::text,true);
select set_config('barberos.tenant_b',gen_random_uuid()::text,true);
select set_config('barberos.tenant_barber',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
values(current_setting('barberos.tenant_owner')::uuid,current_setting('barberos.tenant_owner')||'@example.invalid','{}');
insert into public.barbershops(id,slug,name,status)
values(current_setting('barberos.tenant_a')::uuid,'immutable-'||current_setting('barberos.tenant_a'),'Tenant A','trial'),
      (current_setting('barberos.tenant_b')::uuid,'immutable-'||current_setting('barberos.tenant_b'),'Tenant B','trial');
insert into public.barbershop_members(barbershop_id,user_id,role)
values(current_setting('barberos.tenant_a')::uuid,current_setting('barberos.tenant_owner')::uuid,'owner'),
      (current_setting('barberos.tenant_b')::uuid,current_setting('barberos.tenant_owner')::uuid,'owner');
insert into public.barbers(id,barbershop_id,display_name)
values(current_setting('barberos.tenant_barber')::uuid,current_setting('barberos.tenant_a')::uuid,'Immutable fixture');
select set_config('request.jwt.claim.sub',current_setting('barberos.tenant_owner'),true);
set local role authenticated;
do $test$
declare denied boolean:=false;
begin
  -- The tenant-root row has no barbershop_id field. Generic row guards must
  -- not fail when a legitimate owner updates its ordinary profile fields.
  update public.barbershops set name='Updated tenant A' where id=current_setting('barberos.tenant_a')::uuid;
  if not found then raise exception 'TENANT_ROOT_UPDATE_MISSING'; end if;
  update public.barbers set display_name='Updated fixture' where id=current_setting('barberos.tenant_barber')::uuid;
  if not found then raise exception 'TENANT_CHILD_UPDATE_MISSING'; end if;
  begin
    update public.barbers set barbershop_id=current_setting('barberos.tenant_b')::uuid
      where id=current_setting('barberos.tenant_barber')::uuid;
  exception when others then if sqlerrm='TENANT_IMMUTABLE' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'TENANT_REPARENT_ALLOWED'; end if;
  if not exists(select 1 from public.barbers where id=current_setting('barberos.tenant_barber')::uuid
    and barbershop_id=current_setting('barberos.tenant_a')::uuid) then raise exception 'TENANT_REPARENT_NOT_ROLLED_BACK'; end if;
end;
$test$;
reset role;
rollback;
select 'TENANT_IMMUTABILITY_BOUNDARY_PASSED' as result;
