
-- BarberOS Phase 4: availability data boundary hardening
drop policy if exists schedule_overrides_public_read on public.schedule_overrides;
drop policy if exists schedule_overrides_team_read on public.schedule_overrides;

create policy schedule_overrides_team_read
on public.schedule_overrides
for select
to authenticated
using (
  private.is_member(barbershop_id)
  or private.is_platform_admin()
);

revoke all on table public.schedule_overrides from anon, authenticated;
grant select on table public.schedule_overrides to authenticated;
