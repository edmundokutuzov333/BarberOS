-- Complete forward candidate. It is not in the migration chain while the
-- historical-source reconciliation freeze is active. Apply only through a
-- versioned migration after its prerequisite reconciliation is recorded.
alter table public.profiles
  add column if not exists password_change_required boolean not null default false;

create or replace function private.current_password_change_required(p_user uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
  select coalesce((select p.password_change_required from public.profiles p where p.id=p_user),p_user is not null);
$function$;
revoke all on function private.current_password_change_required(uuid) from public,anon,authenticated;

-- These two policy helpers must remain callable by browser roles inside RLS.
-- Their SECURITY DEFINER body reads authoritative profiles; JWT/user metadata
-- cannot clear the flag or promote a temporary-password account.
create or replace function private.is_member(
  p_shop uuid,
  p_roles public.app_role[] default array['owner','manager','barber']::public.app_role[]
)
returns boolean language sql stable security definer set search_path=''
as $function$
  select not private.current_password_change_required((select auth.uid()))
    and exists(select 1 from public.barbershop_members m
      where m.barbershop_id=p_shop and m.user_id=(select auth.uid()) and m.role=any(p_roles));
$function$;
revoke all on function private.is_member(uuid,public.app_role[]) from public;
grant execute on function private.is_member(uuid,public.app_role[]) to anon,authenticated;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $function$
  select not private.current_password_change_required((select auth.uid()))
    and coalesce((select p.is_platform_admin from public.profiles p where p.id=(select auth.uid())),false);
$function$;
revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to anon,authenticated;

create or replace function private.require_agenda_access(p_shop uuid)
returns void language plpgsql security definer set search_path=''
as $function$
begin
  if private.current_password_change_required(auth.uid()) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if p_shop is null then raise exception 'SHOP_REQUIRED'; end if;
  if private.is_platform_admin() then return; end if;
  if private.is_member(p_shop,array['owner','manager','barber']::public.app_role[]) then return; end if;
  raise exception 'SHOP_OPERATOR_REQUIRED';
end;
$function$;
revoke all on function private.require_agenda_access(uuid) from public,anon,authenticated;

create or replace function private.require_platform_admin()
returns void language plpgsql stable security definer set search_path=''
as $function$
begin
  if private.current_password_change_required(auth.uid()) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if not private.is_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
end;
$function$;
revoke all on function private.require_platform_admin() from public,anon,authenticated;

-- Preserve existing browser/service ACLs while making compatibility wrappers
-- observe the same authoritative state as the private policy helpers.
create or replace function public.is_member(
  p_shop uuid,
  p_roles public.app_role[] default array['owner','manager','barber']::public.app_role[]
)
returns boolean language sql stable security definer set search_path=''
as $function$
  select private.is_member(p_shop,p_roles);
$function$;
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $function$
  select private.is_platform_admin();
$function$;

-- The older policy called a public helper whose browser EXECUTE was revoked.
-- Self comparisons preserve protected flags without exposing private helpers.
drop policy if exists prof_update on public.profiles;
create policy prof_update on public.profiles for update to authenticated
using(id=(select auth.uid()))
with check(
  id=(select auth.uid())
  and is_platform_admin=(select p.is_platform_admin from public.profiles p where p.id=(select auth.uid()))
  and password_change_required=(select p.password_change_required from public.profiles p where p.id=(select auth.uid()))
);
