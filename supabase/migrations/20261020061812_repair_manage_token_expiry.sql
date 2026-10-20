-- Repair production schema drift that broke management links immediately after booking.
-- Existing manage tokens are preserved; missing expiry values are backfilled.
alter table public.appointments
  add column if not exists manage_token_expires_at timestamptz;

update public.appointments
set manage_token_expires_at = ends_at + interval '30 days'
where manage_token_expires_at is null;

create or replace function private.set_manage_token_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.manage_token_expires_at := coalesce(
    new.manage_token_expires_at,
    new.ends_at + interval '30 days'
  );
  return new;
end
$$;

drop trigger if exists appointments_manage_token_expiry on public.appointments;
create trigger appointments_manage_token_expiry
before insert or update of ends_at on public.appointments
for each row execute function private.set_manage_token_expiry();

comment on column public.appointments.manage_token_expires_at
is 'Expiry for the public appointment management token; defaults to 30 days after the appointment end.';
