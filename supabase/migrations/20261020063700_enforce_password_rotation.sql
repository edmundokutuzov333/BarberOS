-- Enforce mandatory password rotation on the server, not only in the user interface.
create or replace function private.current_password_change_required(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.password_change_required from public.profiles as p where p.id = p_user),
    false
  );
$$;

revoke all on function private.current_password_change_required(uuid) from public, anon, authenticated;

create or replace function public.is_member(
  p_shop uuid,
  p_roles app_role[] default array['owner','manager','barber']::app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not private.current_password_change_required(auth.uid())
    and exists (
      select 1
      from public.barbershop_members as m
      where m.barbershop_id = p_shop
        and m.user_id = auth.uid()
        and m.role = any(p_roles)
    );
$$;

drop policy if exists prof_update on public.profiles;
create policy prof_update on public.profiles for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and is_platform_admin() = (select p.is_platform_admin from public.profiles as p where p.id = auth.uid())
  and password_change_required = private.current_password_change_required(auth.uid())
);
