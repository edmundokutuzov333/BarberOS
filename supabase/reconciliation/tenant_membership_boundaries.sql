-- Reviewed forward candidate; deploy with the authoritative account-state guard.
-- Both membership mutations serialize on the same tenant key, then recheck the
-- actor. A target-row lock alone cannot prevent two owners removing each other.
create or replace function public.add_member_by_email(p_shop uuid,p_email text,p_role public.app_role)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_user uuid; v_member public.barbershop_members%rowtype; v_id uuid;
begin
  if p_shop is null then raise exception 'SHOP_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||p_shop::text,0));
  if private.current_password_change_required(auth.uid()) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if not private.is_member(p_shop,array['owner']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_email is null or length(btrim(p_email)) not between 3 and 254 then raise exception 'INVALID_EMAIL'; end if;
  if p_role is null then raise exception 'INVALID_ROLE'; end if;
  select u.id into v_user from auth.users u where lower(u.email)=lower(btrim(p_email));
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  select m.* into v_member from public.barbershop_members m
    where m.barbershop_id=p_shop and m.user_id=v_user for update;
  if found then
    if v_member.role=p_role then return v_member.id; end if;
    if v_member.role='owner' and p_role<>'owner' and not exists(
      select 1 from public.barbershop_members m where m.barbershop_id=p_shop and m.role='owner' and m.id<>v_member.id
    ) then raise exception 'LAST_OWNER'; end if;
    update public.barbershop_members set role=p_role where id=v_member.id;
    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
      values(p_shop,auth.uid(),'member_role_changed','barbershop_member',v_member.id,
        jsonb_build_object('user_id',v_user,'old_role',v_member.role,'new_role',p_role));
    return v_member.id;
  end if;
  insert into public.barbershop_members(barbershop_id,user_id,role) values(p_shop,v_user,p_role) returning id into v_id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(p_shop,auth.uid(),'member_added','barbershop_member',v_id,jsonb_build_object('user_id',v_user,'role',p_role));
  return v_id;
end;
$function$;
revoke all on function public.add_member_by_email(uuid,text,public.app_role) from public,anon;
grant execute on function public.add_member_by_email(uuid,text,public.app_role) to authenticated,service_role;

create or replace function public.remove_barbershop_member(p_shop uuid,p_member uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_target public.barbershop_members%rowtype;
begin
  if p_shop is null then raise exception 'SHOP_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||p_shop::text,0));
  if private.current_password_change_required(auth.uid()) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if not private.is_member(p_shop,array['owner']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_member is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  select m.* into v_target from public.barbershop_members m where m.id=p_member and m.barbershop_id=p_shop for update;
  -- An already absent member is a successful replay. Authorization is checked
  -- first, and a member from another tenant is never read or changed.
  if not found then return; end if;
  if v_target.user_id=auth.uid() then raise exception 'MEMBER_SELF_REMOVE'; end if;
  if v_target.role='owner' and not exists(
    select 1 from public.barbershop_members m where m.barbershop_id=p_shop and m.role='owner' and m.id<>v_target.id
  ) then raise exception 'LAST_OWNER'; end if;
  delete from public.barbershop_members where id=v_target.id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(p_shop,auth.uid(),'member_removed','barbershop_member',p_member,
      jsonb_build_object('removed_user_id',v_target.user_id,'role',v_target.role));
end;
$function$;
revoke all on function public.remove_barbershop_member(uuid,uuid) from public,anon;
grant execute on function public.remove_barbershop_member(uuid,uuid) to authenticated,service_role;
