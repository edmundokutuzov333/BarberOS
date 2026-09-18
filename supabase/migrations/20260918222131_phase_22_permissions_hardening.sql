-- BarberOS Phase 22: permission audit, least-privilege grants and tenant isolation.

revoke all on all tables in schema public from anon;
grant select on public.barbershops, public.services, public.haircuts,
  public.barbers, public.barber_services, public.working_hours, public.reviews
  to anon;

revoke references, trigger, truncate on all tables in schema public from anon, authenticated;

revoke insert, update, delete on public.appointments, public.payments,
  public.notifications, public.reviews, public.waitlist_entries,
  public.audit_logs, public.payment_accounts, public.support_tickets
  from anon, authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.barbershop_members from anon, authenticated;
revoke insert, update, delete on public.customers from anon, authenticated;
revoke all on public.payment_accounts from anon, authenticated;
revoke all on public.support_tickets from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select on public.profiles, public.plans, public.barbershops, public.services,
  public.haircuts, public.barbers, public.barber_services, public.working_hours,
  public.reviews, public.appointments, public.customers, public.notifications,
  public.waitlist_entries, public.payments, public.schedule_overrides
  to authenticated;

create or replace function private.prevent_tenant_reparent()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op = 'UPDATE'
     and new.barbershop_id is distinct from old.barbershop_id
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'TENANT_IMMUTABLE';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'appointments','audit_logs','barber_services','barbers','barbershop_members',
    'barbershops','customers','haircuts','notifications','payment_accounts',
    'payments','reviews','schedule_overrides','services','support_tickets',
    'time_blocks','waitlist_entries','working_hours'
  ]
  loop
    execute format('drop trigger if exists tenant_reparent_guard on public.%I', t);
    execute format('create trigger tenant_reparent_guard before update on public.%I for each row execute function private.prevent_tenant_reparent()', t);
  end loop;
end;
$$;

create or replace function private.prevent_platform_admin_escalation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and current_user not in ('postgres','service_role','supabase_admin')
     and not private.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_admin_flag_guard on public.profiles;
create trigger platform_admin_flag_guard
before update of is_platform_admin on public.profiles
for each row execute function private.prevent_platform_admin_escalation();

drop policy if exists prof_update on public.profiles;
create policy prof_update
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and is_platform_admin = private.is_platform_admin()
);

create or replace function private.prevent_shop_platform_field_change()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if (new.status is distinct from old.status
      or new.plan_id is distinct from old.plan_id)
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists shop_platform_field_guard on public.barbershops;
create trigger shop_platform_field_guard
before update of status, plan_id on public.barbershops
for each row execute function private.prevent_shop_platform_field_change();

drop function if exists public.remove_barbershop_member(uuid,uuid);
create function public.remove_barbershop_member(p_shop uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target public.barbershop_members%rowtype;
begin
  if not private.is_member(p_shop, array['owner']::public.app_role[]) then
    raise exception 'FORBIDDEN';
  end if;

  select m.* into v_target
  from public.barbershop_members m
  where m.id = p_member
    and m.barbershop_id = p_shop
  for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'MEMBER_SELF_REMOVE';
  end if;

  if v_target.role = 'owner'
     and not exists (
       select 1
       from public.barbershop_members m
       where m.barbershop_id = p_shop
         and m.role = 'owner'
         and m.id <> v_target.id
     ) then
    raise exception 'LAST_OWNER';
  end if;

  delete from public.barbershop_members m where m.id = v_target.id;

  insert into public.audit_logs(
    barbershop_id, actor_id, action, entity, entity_id, diff
  )
  values (
    p_shop, auth.uid(), 'member_removed', 'barbershop_member', p_member,
    jsonb_build_object('removed_user_id', v_target.user_id, 'role', v_target.role)
  );
end;
$$;

revoke all on function public.remove_barbershop_member(uuid,uuid) from public, anon;
grant execute on function public.remove_barbershop_member(uuid,uuid) to authenticated;

create or replace function public.list_members(p_shop uuid)
returns table(
  id uuid,
  user_id uuid,
  role public.app_role,
  full_name text,
  email text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    m.id,
    m.user_id,
    m.role,
    p.full_name,
    u.email::text,
    m.created_at
  from public.barbershop_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.barbershop_id = p_shop
    and (
      private.is_member(p_shop, array['owner','manager']::public.app_role[])
      or private.is_platform_admin()
    )
  order by m.created_at;
$$;

revoke all on function public.list_members(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;

drop function if exists public.admin_update_support_ticket(
  uuid,
  public.support_ticket_status,
  public.support_ticket_priority,
  uuid
);
