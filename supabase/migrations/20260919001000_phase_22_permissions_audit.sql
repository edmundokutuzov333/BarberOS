-- BarberOS Phase 22: role permissions audit and least-privilege enforcement.
-- Scope: owner, manager, barber, anonymous, platform admin.
-- This migration is additive/non-destructive. It does not delete business data.

create or replace function public.get_dashboard_snapshot(p_shop uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tz text;
  v_today date;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_month_from_ts timestamptz;
  v_barber uuid;
  v_is_barber boolean;
  v_today_count bigint;
  v_booked_minutes numeric;
  v_capacity_minutes numeric;
  v_revenue_cents bigint;
  v_no_shows bigint;
  v_pending_deposit bigint;
  v_waiting bigint;
  v_new_reviews bigint;
  v_has_barbers boolean;
  v_next jsonb;
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  perform private.require_agenda_access(p_shop);

  select s.timezone
    into v_tz
  from public.barbershops s
  where s.id=p_shop;

  if v_tz is null then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber := private.my_barber_id(p_shop);
    if v_barber is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_from_ts := v_today::timestamp at time zone v_tz;
  v_to_ts := (v_today + 1)::timestamp at time zone v_tz;
  v_month_from_ts := date_trunc('month', v_today::timestamp) at time zone v_tz;

  select count(*)::bigint
    into v_today_count
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and a.status<>'cancelled'
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(a.duration_min) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::numeric
    into v_booked_minutes
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(capacity_minutes),0)::numeric
    into v_capacity_minutes
  from private.report_capacity_by_day(
    p_shop,
    v_today,
    v_today,
    v_barber
  );

  select coalesce(sum(a.price_cents) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::bigint
    into v_revenue_cents
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_no_shows
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='no_show'
    and a.starts_at>=v_month_from_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_pending_deposit
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='pending'
    and a.deposit_status='awaiting'
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  if v_is_barber then
    v_waiting := 0;
  else
    select count(*)::bigint
      into v_waiting
    from public.waitlist_entries w
    where w.barbershop_id=p_shop
      and w.status='waiting';
  end if;

  select count(*)::bigint
    into v_new_reviews
  from public.reviews r
  where r.barbershop_id=p_shop
    and r.created_at>=now()-interval '7 days'
    and (not v_is_barber or r.barber_id=v_barber);

  select exists(
    select 1
    from public.barbers b
    where b.barbershop_id=p_shop
      and b.is_active
      and (not v_is_barber or b.id=v_barber)
  )
  into v_has_barbers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'appointment_id', x.id,
        'starts_at', x.starts_at,
        'status', x.status,
        'customer_name', x.customer_name,
        'service_name', x.service_name,
        'haircut_name', x.haircut_name,
        'barber_name', x.barber_name
      )
      order by x.starts_at
    ),
    '[]'::jsonb
  )
    into v_next
  from (
    select
      a.id,
      a.starts_at,
      a.status,
      c.name as customer_name,
      s.name as service_name,
      h.name as haircut_name,
      b.display_name as barber_name
    from public.appointments a
    join public.customers c
      on c.id=a.customer_id
     and c.barbershop_id=a.barbershop_id
    join public.services s
      on s.id=a.service_id
     and s.barbershop_id=a.barbershop_id
    left join public.haircuts h
      on h.id=a.haircut_id
     and h.barbershop_id=a.barbershop_id
    join public.barbers b
      on b.id=a.barber_id
     and b.barbershop_id=a.barbershop_id
    where a.barbershop_id=p_shop
      and a.starts_at>=now()
      and a.starts_at<v_to_ts
      and a.status in ('pending','confirmed')
      and (not v_is_barber or a.barber_id=v_barber)
    order by a.starts_at
    limit 5
  ) x;

  return jsonb_build_object(
    'today', v_today_count,
    'occupancy', case
      when v_capacity_minutes>0
        then round(least(100::numeric,(v_booked_minutes/v_capacity_minutes)*100),2)
      else null
    end,
    'revenue', v_revenue_cents,
    'noShows', v_no_shows,
    'pendingDeposit', v_pending_deposit,
    'waiting', v_waiting,
    'newReviews', v_new_reviews,
    'hasBarbers', v_has_barbers,
    'next', v_next
  );
end;
$$;

comment on function public.get_dashboard_snapshot(uuid)
is 'Tenant-scoped dashboard read model. Owner/manager see tenant metrics; barber sees only own operational metrics and own customer appointment data.';

create or replace function public.list_members(p_shop uuid)
returns table(
  id uuid,
  user_id uuid,
  role public.app_role,
  full_name text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if private.is_platform_admin() then
    null;
  elsif not private.is_member(
    p_shop,
    array['owner']::public.app_role[]
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  return query
  select
    m.id,
    m.user_id,
    m.role,
    p.full_name,
    u.email::text,
    m.created_at
  from public.barbershop_members m
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.barbershop_id=p_shop
  order by m.created_at;
end;
$$;

comment on function public.list_members(uuid)
is 'Owner/platform-admin only team directory. Prevents manager/barber enumeration of tenant members and email addresses.';

-- Direct table RLS: tenant data remains readable only inside the role boundary.

drop policy if exists mem_read on public.barbershop_members;
create policy mem_read_v22 on public.barbershop_members
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.is_member(barbershop_id,array['owner']::public.app_role[])
  or private.is_platform_admin()
);

drop policy if exists barbers_public_read on public.barbers;
drop policy if exists barbers_self_update on public.barbers;
drop policy if exists barbers_write on public.barbers;
create policy barbers_read_v22 on public.barbers
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and id=private.my_barber_id(barbershop_id)
  )
);
create policy barbers_write_v22 on public.barbers
for all to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
)
with check (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
);

drop policy if exists bs_read on public.barber_services;
create policy bs_read_v22 on public.barber_services
for select to authenticated
using (
  exists (
    select 1
    from public.barbers b
    where b.id=barber_id
      and (
        private.is_platform_admin()
        or private.is_member(b.barbershop_id,array['owner','manager']::public.app_role[])
        or (
          private.is_member(b.barbershop_id,array['barber']::public.app_role[])
          and b.id=private.my_barber_id(b.barbershop_id)
        )
      )
  )
);

drop policy if exists cust_read on public.customers;
create policy cust_read_v22 on public.customers
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and exists (
      select 1
      from public.appointments a
      where a.barbershop_id=customers.barbershop_id
        and a.customer_id=customers.id
        and a.barber_id=private.my_barber_id(customers.barbershop_id)
    )
  )
);

drop policy if exists wl_read on public.waitlist_entries;
create policy wl_read_v22 on public.waitlist_entries
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
);

drop policy if exists rev_public_read on public.reviews;
create policy rev_read_v22 on public.reviews
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and barber_id=private.my_barber_id(barbershop_id)
  )
);

drop policy if exists schedule_overrides_team_read on public.schedule_overrides;
create policy schedule_overrides_read_v22 on public.schedule_overrides
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and (barber_id=private.my_barber_id(barbershop_id) or barber_id is null)
  )
);

drop policy if exists tb_read on public.time_blocks;
create policy tb_read_v22 on public.time_blocks
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and barber_id=private.my_barber_id(barbershop_id)
  )
);

drop policy if exists wh_public_read on public.working_hours;
create policy wh_read_v22 on public.working_hours
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and (barber_id=private.my_barber_id(barbershop_id) or barber_id is null)
  )
);

-- Direct writes are retained only where the role policy already models the operation.
-- Sensitive operations continue through SECURITY DEFINER RPCs.

revoke all on public.profiles, public.plans, public.barbershops, public.barbershop_members,
  public.barbers, public.services, public.barber_services, public.haircuts,
  public.working_hours, public.time_blocks, public.schedule_overrides,
  public.customers, public.appointments, public.waitlist_entries, public.reviews,
  public.payments, public.notifications, public.audit_logs
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select on public.plans to authenticated;

grant select on public.barbershops to authenticated;
grant update on public.barbershops to authenticated;

grant select, delete on public.barbershop_members to authenticated;

grant select, insert, update, delete on public.barbers to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.barber_services to authenticated;
grant select, insert, update, delete on public.haircuts to authenticated;
grant select, insert, update, delete on public.working_hours to authenticated;
grant select, insert, update, delete on public.time_blocks to authenticated;

grant select on public.schedule_overrides to authenticated;
grant select on public.appointments to authenticated;
grant select on public.customers to authenticated;
grant select on public.waitlist_entries to authenticated;
grant select on public.reviews to authenticated;
grant select on public.payments to authenticated;
grant select on public.audit_logs to authenticated;

-- notifications and other sensitive tables remain RPC-only for client roles.

-- Remove EXECUTE from every existing public-schema function, then explicitly reopen
-- authenticated client boundaries. This closes accidental/default grants safely.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public,anon,authenticated',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;

do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
  loop
    execute format(
      'grant execute on function %I.%I(%s) to authenticated',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  end loop;
end
$$;

-- Internal/server-only functions. They stay executable by service_role only.
do $$
declare
  function_names text[] := array[
    'claim_notifications',
    'mark_notification_failure',
    'mark_notification_sent',
    'recover_stuck_notifications',
    'enqueue_appointment_notifications',
    'handle_new_user',
    'on_appointment_completed',
    'claim_payment_reconciliation',
    'list_payment_reconciliation_batch',
    'finalize_payment_event',
    'find_payment_by_provider_ref',
    'mark_payment_provider_started',
    'get_payment_runtime_config',
    'get_payment_webhook_context',
    'scheduler_secret_valid',
    'set_payment_provider_account',
    'is_member',
    'is_platform_admin',
    'my_barber_id',
    'shop_is_public'
  ];
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname=any(function_names)
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public,anon,authenticated',
      r.schema_name,r.function_name,r.identity_args
    );
  end loop;
end
$$;

-- Anonymous customer surface. Nothing here grants direct table access.
do $$
declare
  function_names text[] := array[
    'get_public_barbershop',
    'get_public_payment_methods',
    'get_available_days',
    'get_available_slots',
    'book_appointment',
    'get_appointment_by_token',
    'cancel_appointment_by_token',
    'get_reschedule_slots_by_token',
    'reschedule_appointment_by_token',
    'get_review_by_token',
    'submit_review_by_token',
    'join_waitlist',
    'get_waitlist_offer',
    'claim_waitlist_offer',
    'expire_waitlist_offer',
    'get_payment_status_by_token',
    'get_payment_runtime_for_token',
    'init_payment_from_token'
  ];
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname=any(function_names)
  loop
    execute format(
      'grant execute on function %I.%I(%s) to anon,authenticated',
      r.schema_name,r.function_name,r.identity_args
    );
  end loop;
end
$$;

grant execute on function public.get_dashboard_snapshot(uuid) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
