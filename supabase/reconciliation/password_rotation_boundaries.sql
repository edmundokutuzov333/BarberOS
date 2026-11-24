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

-- Cloud production currently revokes table UPDATE altogether. Permit only
-- ordinary self-profile fields; identity/privileged flags remain server-only.
-- RLS still restricts rows and provides a second protected-flag boundary.
revoke update on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,phone,avatar_url) on public.profiles to authenticated;

-- Shop creation has no existing membership to check, so it requires its own
-- account-state boundary. Slug uniqueness also makes identical owner retries
-- return the existing shop without duplicating membership, hours or audit.
create or replace function public.create_barbershop(
  p_name text,p_slug text,p_phone text default null,p_whatsapp text default null
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_id uuid; v_plan uuid;
  v_name text:=nullif(btrim(p_name),''); v_slug text:=lower(btrim(p_slug));
  v_phone text:=nullif(btrim(p_phone),''); v_whatsapp text:=nullif(btrim(p_whatsapp),'');
begin
  if v_actor is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if private.current_password_change_required(v_actor) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'INVALID_NAME'; end if;
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID_SLUG'; end if;
  select p.id into v_plan from public.plans p where p.code='starter' and p.is_active;
  if v_plan is null then raise exception 'PLAN_NOT_ACTIVE'; end if;
  insert into public.barbershops(name,slug,phone,whatsapp,plan_id)
    values(v_name,v_slug,v_phone,v_whatsapp,v_plan)
    on conflict(slug) do nothing returning id into v_id;
  if v_id is null then
    select s.id into v_id from public.barbershops s
      join public.barbershop_members m on m.barbershop_id=s.id and m.user_id=v_actor and m.role='owner'
      where s.slug=v_slug and s.name=v_name and s.phone is not distinct from v_phone and s.whatsapp is not distinct from v_whatsapp;
    if v_id is not null then return v_id; end if;
    raise exception 'SLUG_TAKEN';
  end if;
  insert into public.barbershop_members(barbershop_id,user_id,role) values(v_id,v_actor,'owner');
  insert into public.working_hours(barbershop_id,weekday,opens_at,closes_at,is_closed)
    select v_id,d,'09:00','19:00',d=0 from generate_series(0,6) d;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id)
    values(v_id,v_actor,'barbershop.created','barbershops',v_id);
  return v_id;
end;
$function$;
revoke all on function public.create_barbershop(text,text,text,text) from public,anon;
grant execute on function public.create_barbershop(text,text,text,text) to authenticated,service_role;
