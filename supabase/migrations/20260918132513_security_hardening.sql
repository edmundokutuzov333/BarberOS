-- BarberOS Phase 1: security hardening
create schema if not exists private;

create or replace function private.is_member(
  p_shop uuid,
  p_roles public.app_role[] default array['owner','manager','barber']::public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.barbershop_members m
    where m.barbershop_id=p_shop
      and m.user_id=(select auth.uid())
      and m.role=any(p_roles)
  );
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    (select p.is_platform_admin
     from public.profiles p
     where p.id=(select auth.uid())),
    false
  );
$$;

create or replace function private.my_barber_id(p_shop uuid)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select b.id
  from public.barbers b
  where b.barbershop_id=p_shop
    and b.user_id=(select auth.uid())
  limit 1;
$$;

create or replace function private.shop_is_public(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.barbershops s
    where s.id=p_shop
      and s.status in ('active','trial')
  );
$$;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
revoke all on function private.is_member(uuid,public.app_role[]) from public, anon, authenticated;
revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function private.my_barber_id(uuid) from public, anon, authenticated;
revoke all on function private.shop_is_public(uuid) from public, anon, authenticated;

grant execute on function private.is_member(uuid,public.app_role[]) to anon, authenticated;
grant execute on function private.is_platform_admin() to anon, authenticated;
grant execute on function private.my_barber_id(uuid) to anon, authenticated;
grant execute on function private.shop_is_public(uuid) to anon, authenticated;

do $$
declare
  r record;
  u text;
  c text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public','storage')
  loop
    u := coalesce(r.qual,'');
    u := replace(u,'is_member(','private.is_member(');
    u := replace(u,'is_platform_admin(','private.is_platform_admin(');
    u := replace(u,'my_barber_id(','private.my_barber_id(');
    u := replace(u,'shop_is_public(','private.shop_is_public(');

    c := coalesce(r.with_check,'');
    c := replace(c,'is_member(','private.is_member(');
    c := replace(c,'is_platform_admin(','private.is_platform_admin(');
    c := replace(c,'my_barber_id(','private.my_barber_id(');
    c := replace(c,'shop_is_public(','private.shop_is_public(');

    execute format(
      'alter policy %I on %I.%I to anon, authenticated%s%s',
      r.policyname,
      r.schemaname,
      r.tablename,
      case when r.qual is not null then ' using ('||u||')' else '' end,
      case when r.with_check is not null then ' with check ('||c||')' else '' end
    );
  end loop;
end
$$;

drop policy if exists appt_write on public.appointments;
drop policy if exists appt_barber_update on public.appointments;
drop policy if exists pay_admin on public.payments;
drop policy if exists notif_update on public.notifications;
drop policy if exists rev_write on public.reviews;
drop policy if exists wl_write on public.waitlist_entries;

revoke insert, update, delete, truncate on public.appointments from anon, authenticated;
revoke insert, update, delete, truncate on public.payments from anon, authenticated;
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
revoke insert, update, delete, truncate on public.reviews from anon, authenticated;
revoke insert, update, delete, truncate on public.waitlist_entries from anon, authenticated;
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

grant select on public.appointments to authenticated;
grant select on public.payments to authenticated;
grant select on public.notifications to authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.waitlist_entries to authenticated;
grant select on public.audit_logs to authenticated;

revoke execute on function public.is_member(uuid,public.app_role[]) from public, anon, authenticated;
revoke execute on function public.is_platform_admin() from public, anon, authenticated;
revoke execute on function public.my_barber_id(uuid) from public, anon, authenticated;
revoke execute on function public.shop_is_public(uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_appointment_notifications(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_appointment_completed() from public, anon, authenticated;

revoke execute on function public.create_barbershop(text,text,text,text) from public, anon;
revoke execute on function public.add_member_by_email(uuid,text,public.app_role) from public, anon;
revoke execute on function public.list_members(uuid) from public, anon;
revoke execute on function public.seed_haircut_catalogue(uuid) from public, anon;

revoke execute on function public.get_available_slots(text,uuid,uuid,date) from public;
revoke execute on function public.get_available_days(text,uuid,uuid,date,date) from public;
revoke execute on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text) from public;

grant execute on function public.create_barbershop(text,text,text,text) to authenticated;
grant execute on function public.add_member_by_email(uuid,text,public.app_role) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.seed_haircut_catalogue(uuid) to authenticated;

grant execute on function public.get_available_slots(text,uuid,uuid,date) to anon, authenticated;
grant execute on function public.get_available_days(text,uuid,uuid,date,date) to anon, authenticated;
grant execute on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text) to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

create or replace function private.prevent_tenant_move()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.barbershop_id is distinct from old.barbershop_id then
    raise exception 'TENANT_IMMUTABLE';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'barbershop_members',
    'barbers',
    'services',
    'haircuts',
    'working_hours',
    'time_blocks',
    'customers',
    'appointments',
    'waitlist_entries',
    'reviews',
    'payments',
    'notifications',
    'audit_logs'
  ]
  loop
    execute format(
      'drop trigger if exists prevent_tenant_move on public.%I',
      t
    );
    execute format(
      'create trigger prevent_tenant_move
       before update of barbershop_id on public.%I
       for each row
       execute function private.prevent_tenant_move()',
      t
    );
  end loop;
end
$$;

revoke all on function private.prevent_tenant_move() from public, anon, authenticated;
