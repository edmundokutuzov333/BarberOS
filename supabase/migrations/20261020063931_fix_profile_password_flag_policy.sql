-- Keep profile updates functional while users cannot clear their own forced password-rotation flag.
-- The prior policy called a private helper directly from an authenticated RLS expression,
-- which would require granting execute permission on a helper that should stay private.
drop policy if exists prof_update on public.profiles;

create policy prof_update on public.profiles for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and is_platform_admin() = (select p.is_platform_admin from public.profiles as p where p.id = auth.uid())
  and password_change_required = (
    select p.password_change_required
    from public.profiles as p
    where p.id = auth.uid()
  )
);

revoke all on function private.current_password_change_required(uuid) from public, anon, authenticated;
