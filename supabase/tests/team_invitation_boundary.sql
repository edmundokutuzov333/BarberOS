-- Synthetic identities, invitation tokens and tenant records are rolled back.
begin;
select set_config('barberos.invite.owner',gen_random_uuid()::text,true);
select set_config('barberos.invite.barber',gen_random_uuid()::text,true);
select set_config('barberos.invite.manager',gen_random_uuid()::text,true);
select set_config('barberos.invite.shop',gen_random_uuid()::text,true);
select set_config('barberos.invite.other_shop',gen_random_uuid()::text,true);
select set_config('barberos.invite.professional',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select v::uuid,v||'@example.invalid',now(),'{}'::jsonb from unnest(array[
  current_setting('barberos.invite.owner'),current_setting('barberos.invite.barber'),current_setting('barberos.invite.manager')]) v;
insert into public.barbershops(id,slug,name,status) select v::uuid,'invite-'||v,'Invitation fixture','trial'
from unnest(array[current_setting('barberos.invite.shop'),current_setting('barberos.invite.other_shop')]) v;
insert into public.barbershop_members(barbershop_id,user_id,role)
values(current_setting('barberos.invite.shop')::uuid,current_setting('barberos.invite.owner')::uuid,'owner');
insert into public.barbers(id,barbershop_id,display_name,is_active) values(current_setting('barberos.invite.professional')::uuid,current_setting('barberos.invite.shop')::uuid,'Invitation barber',true);
select set_config('request.jwt.claim.sub',current_setting('barberos.invite.owner'),true);
set local role authenticated;
do $owner$
declare s uuid:=current_setting('barberos.invite.shop')::uuid; j jsonb; k jsonb;
begin
  j:=public.create_team_invitation(s,upper(current_setting('barberos.invite.barber')||'@example.invalid'),'barber',current_setting('barberos.invite.professional')::uuid);
  perform set_config('barberos.invite.token',j->>'token',true);
  k:=public.create_team_invitation(s,current_setting('barberos.invite.manager')||'@example.invalid','manager',null);
  perform set_config('barberos.invite.revoked',k->>'token',true);
  if jsonb_array_length(public.list_team_invitations(s))<>2 or public.list_team_invitations(s)::text like '%'||(j->>'token')||'%' then raise exception 'INVITATION_LIST_LEAK_OR_MISSING'; end if;
  if not public.revoke_team_invitation(s,(k->>'id')::uuid) then raise exception 'INVITATION_REVOKE_FAILED'; end if;
  k:=public.create_team_invitation(s,current_setting('barberos.invite.manager')||'@example.invalid','manager',null);
  perform set_config('barberos.invite.manager_token',k->>'token',true);
  begin
    perform public.create_team_invitation(current_setting('barberos.invite.other_shop')::uuid,current_setting('barberos.invite.manager')||'@example.invalid','manager',null);
    raise exception 'CROSS_TENANT_INVITATION_ALLOWED';
  exception when insufficient_privilege then if sqlerrm<>'OWNER_REQUIRED' then raise; end if; end;
end;
$owner$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.invite.manager'),true);
set local role authenticated;
do $manager$
declare j jsonb;
begin
  begin
    perform public.accept_team_invitation(current_setting('barberos.invite.token'));
    raise exception 'WRONG_EMAIL_ACCEPTED';
  exception when others then if sqlerrm<>'INVITATION_INVALID' then raise; end if; end;
  begin
    perform public.accept_team_invitation(current_setting('barberos.invite.revoked'));
    raise exception 'REVOKED_TOKEN_ACCEPTED';
  exception when others then if sqlerrm<>'INVITATION_INVALID' then raise; end if; end;
  j:=public.accept_team_invitation(current_setting('barberos.invite.manager_token'));
  if j->>'role'<>'manager' then raise exception 'INVITATION_MANAGER_ROLE_INCORRECT'; end if;
  begin
    perform public.list_team_invitations(current_setting('barberos.invite.shop')::uuid);
    raise exception 'MANAGER_INVITATION_DIRECTORY_ALLOWED';
  exception when insufficient_privilege then if sqlerrm<>'OWNER_REQUIRED' then raise; end if; end;
end;
$manager$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.invite.barber'),true);
set local role authenticated;
do $barber$
declare j jsonb; k jsonb;
begin
  j:=public.accept_team_invitation(current_setting('barberos.invite.token'));
  k:=public.accept_team_invitation(current_setting('barberos.invite.token'));
  if j->>'role'<>'barber' or k->>'membership_id' is distinct from j->>'membership_id'
     or k->>'idempotent'<>'true' then raise exception 'INVITATION_REPLAY_FAILED'; end if;
  if (select count(*) from public.barbers where id=current_setting('barberos.invite.professional')::uuid and user_id=auth.uid())<>1 then raise exception 'INVITATION_BARBER_LINK_MISSING'; end if;
end;
$barber$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.invite.owner'),true);
set local role authenticated;
do $remove$
declare s uuid:=current_setting('barberos.invite.shop')::uuid; m uuid;
begin
 select id into strict m from public.list_members(s) where user_id=current_setting('barberos.invite.barber')::uuid;
 perform public.remove_barbershop_member(s,m);
end;
$remove$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('barberos.invite.barber'),true);
set local role authenticated;
do $replay$
begin
  begin
    perform public.accept_team_invitation(current_setting('barberos.invite.token'));
    raise exception 'REMOVED_MEMBER_REPLAY_REGRANTED';
  exception when others then if sqlerrm<>'INVITATION_INVALID' then raise; end if; end;
end;
$replay$;
reset role;
rollback;
select 'TEAM_INVITATION_BOUNDARY_PASSED' as result;
