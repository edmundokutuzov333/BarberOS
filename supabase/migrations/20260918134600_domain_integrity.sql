
-- BarberOS Phase 3: domain integrity
-- Protect business invariants before the public/operational layers are expanded.

create unique index if not exists working_hours_base_unique
  on public.working_hours (barbershop_id, weekday)
  where barber_id is null;

create unique index if not exists working_hours_barber_unique
  on public.working_hours (barbershop_id, barber_id, weekday)
  where barber_id is not null;

create unique index if not exists barbers_shop_user_unique
  on public.barbers (barbershop_id, user_id)
  where user_id is not null;

create index if not exists barber_services_service_idx
  on public.barber_services (service_id, barber_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.plans'::regclass and conname='plans_price_nonnegative'
  ) then
    alter table public.plans
      add constraint plans_price_nonnegative check (price_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.plans'::regclass and conname='plans_max_barbers_positive'
  ) then
    alter table public.plans
      add constraint plans_max_barbers_positive check (max_barbers >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbershops'::regclass and conname='barbershops_slot_interval_allowed'
  ) then
    alter table public.barbershops
      add constraint barbershops_slot_interval_allowed
      check (slot_interval_min in (5,10,15,20,30,60));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbershops'::regclass and conname='barbershops_lead_time_allowed'
  ) then
    alter table public.barbershops
      add constraint barbershops_lead_time_allowed
      check (min_lead_time_min between 0 and 1440);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbershops'::regclass and conname='barbershops_advance_window_allowed'
  ) then
    alter table public.barbershops
      add constraint barbershops_advance_window_allowed
      check (max_advance_days between 1 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbershops'::regclass and conname='barbershops_deposit_hold_allowed'
  ) then
    alter table public.barbershops
      add constraint barbershops_deposit_hold_allowed
      check (deposit_hold_min between 5 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbershops'::regclass and conname='barbershops_deposit_value_allowed'
  ) then
    alter table public.barbershops
      add constraint barbershops_deposit_value_allowed
      check (
        deposit_value > 0
        and (
          deposit_mode = 'fixed'
          or (deposit_mode = 'percent' and deposit_value between 1 and 100)
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.haircuts'::regclass and conname='haircuts_price_nonnegative'
  ) then
    alter table public.haircuts
      add constraint haircuts_price_nonnegative
      check (price_cents is null or price_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.haircuts'::regclass and conname='haircuts_duration_allowed'
  ) then
    alter table public.haircuts
      add constraint haircuts_duration_allowed
      check (duration_min is null or duration_min between 5 and 480);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbers'::regclass and conname='barbers_years_nonnegative'
  ) then
    alter table public.barbers
      add constraint barbers_years_nonnegative check (years_experience >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbers'::regclass and conname='barbers_rating_allowed'
  ) then
    alter table public.barbers
      add constraint barbers_rating_allowed check (rating_avg between 0 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.barbers'::regclass and conname='barbers_rating_count_nonnegative'
  ) then
    alter table public.barbers
      add constraint barbers_rating_count_nonnegative check (rating_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.customers'::regclass and conname='customers_visit_counts_nonnegative'
  ) then
    alter table public.customers
      add constraint customers_visit_counts_nonnegative
      check (visits_count >= 0 and no_show_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.appointments'::regclass and conname='appointments_duration_allowed'
  ) then
    alter table public.appointments
      add constraint appointments_duration_allowed
      check (duration_min between 5 and 480);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.appointments'::regclass and conname='appointments_amounts_nonnegative'
  ) then
    alter table public.appointments
      add constraint appointments_amounts_nonnegative
      check (price_cents >= 0 and deposit_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.waitlist_entries'::regclass and conname='waitlist_date_range_valid'
  ) then
    alter table public.waitlist_entries
      add constraint waitlist_date_range_valid
      check (date_from is null or date_to is null or date_from <= date_to);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.payments'::regclass and conname='payments_amount_nonnegative'
  ) then
    alter table public.payments
      add constraint payments_amount_nonnegative check (amount_cents >= 0);
  end if;
end
$$;

create or replace function private.require_shop_operator(p_shop uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if not private.is_member(
    p_shop,
    array['owner','manager']::public.app_role[]
  ) then
    raise exception 'SHOP_OPERATOR_REQUIRED';
  end if;
end;
$$;

revoke all on function private.require_shop_operator(uuid) from public, anon, authenticated;

create or replace function private.validate_domain_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  case tg_table_name
    when 'barber_services' then
      if not exists (
        select 1 from public.barbers b
        where b.id=new.barber_id
      ) or not exists (
        select 1 from public.services s
        where s.id=new.service_id
      ) then
        raise exception 'RELATED_ENTITY_NOT_FOUND';
      end if;

      if (
        select b.barbershop_id from public.barbers b where b.id=new.barber_id
      ) is distinct from (
        select s.barbershop_id from public.services s where s.id=new.service_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'haircuts' then
      if new.service_id is not null
         and not exists (
           select 1 from public.services s
           where s.id=new.service_id
             and s.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'working_hours' then
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id
             and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'time_blocks' then
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id
             and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'appointments' then
      if not exists (
        select 1 from public.barbers b
        where b.id=new.barber_id
          and b.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if not exists (
        select 1 from public.services s
        where s.id=new.service_id
          and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if not exists (
        select 1 from public.customers c
        where c.id=new.customer_id
          and c.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if new.haircut_id is not null
         and not exists (
           select 1 from public.haircuts h
           where h.id=new.haircut_id
             and h.barbershop_id=new.barbershop_id
             and (h.service_id is null or h.service_id=new.service_id)
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'waitlist_entries' then
      if not exists (
        select 1 from public.services s
        where s.id=new.service_id
          and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id
             and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if new.haircut_id is not null
         and not exists (
           select 1 from public.haircuts h
           where h.id=new.haircut_id
             and h.barbershop_id=new.barbershop_id
             and (h.service_id is null or h.service_id=new.service_id)
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'reviews' then
      if not exists (
        select 1 from public.appointments a
        where a.id=new.appointment_id
          and a.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id
             and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'payments' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id
             and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'notifications' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id
             and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

      if new.waitlist_entry_id is not null
         and not exists (
           select 1 from public.waitlist_entries w
           where w.id=new.waitlist_entry_id
             and w.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
  end case;

  return new;
end;
$$;

revoke all on function private.validate_domain_tenant_integrity() from public, anon, authenticated;

drop trigger if exists validate_domain_tenant_integrity on public.barber_services;
create trigger validate_domain_tenant_integrity
before insert or update on public.barber_services
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.haircuts;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, service_id on public.haircuts
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.working_hours;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, barber_id on public.working_hours
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.time_blocks;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, barber_id on public.time_blocks
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.appointments;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, barber_id, service_id, haircut_id, customer_id on public.appointments
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.waitlist_entries;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, service_id, haircut_id, barber_id on public.waitlist_entries
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.reviews;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, barber_id, appointment_id on public.reviews
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.payments;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, appointment_id on public.payments
for each row execute function private.validate_domain_tenant_integrity();

drop trigger if exists validate_domain_tenant_integrity on public.notifications;
create trigger validate_domain_tenant_integrity
before insert or update of barbershop_id, appointment_id, waitlist_entry_id on public.notifications
for each row execute function private.validate_domain_tenant_integrity();

create or replace function public.reorder_services(
  p_shop uuid,
  p_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected int;
  v_received int;
  v_distinct int;
begin
  perform private.require_shop_operator(p_shop);

  v_expected := (select count(*)::int from public.services where barbershop_id=p_shop);
  v_received := coalesce(array_length(p_ids,1),0);
  v_distinct := coalesce((select count(distinct x) from unnest(p_ids) as u(x)),0);

  if v_received <> v_expected or v_distinct <> v_received then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as u(id)
    left join public.services s on s.id=u.id
    where s.id is null or s.barbershop_id<>p_shop
  ) then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  update public.services s
  set sort_order=u.ord::int-1
  from unnest(p_ids) with ordinality as u(id,ord)
  where s.id=u.id
    and s.barbershop_id=p_shop;
end;
$$;

create or replace function public.reorder_haircuts(
  p_shop uuid,
  p_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected int;
  v_received int;
  v_distinct int;
begin
  perform private.require_shop_operator(p_shop);

  v_expected := (select count(*)::int from public.haircuts where barbershop_id=p_shop);
  v_received := coalesce(array_length(p_ids,1),0);
  v_distinct := coalesce((select count(distinct x) from unnest(p_ids) as u(x)),0);

  if v_received <> v_expected or v_distinct <> v_received then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as u(id)
    left join public.haircuts h on h.id=u.id
    where h.id is null or h.barbershop_id<>p_shop
  ) then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  update public.haircuts h
  set sort_order=u.ord::int-1
  from unnest(p_ids) with ordinality as u(id,ord)
  where h.id=u.id
    and h.barbershop_id=p_shop;
end;
$$;

create or replace function public.reorder_barbers(
  p_shop uuid,
  p_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected int;
  v_received int;
  v_distinct int;
begin
  perform private.require_shop_operator(p_shop);

  v_expected := (select count(*)::int from public.barbers where barbershop_id=p_shop);
  v_received := coalesce(array_length(p_ids,1),0);
  v_distinct := coalesce((select count(distinct x) from unnest(p_ids) as u(x)),0);

  if v_received <> v_expected or v_distinct <> v_received then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as u(id)
    left join public.barbers b on b.id=u.id
    where b.id is null or b.barbershop_id<>p_shop
  ) then
    raise exception 'INVALID_REORDER_PAYLOAD';
  end if;

  update public.barbers b
  set sort_order=u.ord::int-1
  from unnest(p_ids) with ordinality as u(id,ord)
  where b.id=u.id
    and b.barbershop_id=p_shop;
end;
$$;

revoke all on function public.reorder_services(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_haircuts(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.reorder_barbers(uuid,uuid[]) from public, anon, authenticated;

grant execute on function public.reorder_services(uuid,uuid[]) to authenticated;
grant execute on function public.reorder_haircuts(uuid,uuid[]) to authenticated;
grant execute on function public.reorder_barbers(uuid,uuid[]) to authenticated;

create or replace function public.replace_working_hours(
  p_shop uuid,
  p_barber_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count int;
  v_distinct int;
begin
  perform private.require_shop_operator(p_shop);

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'INVALID_WORKING_HOURS_PAYLOAD';
  end if;

  if p_barber_id is not null
     and not exists (
       select 1 from public.barbers b
       where b.id=p_barber_id
         and b.barbershop_id=p_shop
     ) then
    raise exception 'TENANT_RELATION_MISMATCH';
  end if;

  select count(*)::int into v_count
  from jsonb_to_recordset(p_rows) as x(
    weekday int,
    opens_at time,
    closes_at time,
    is_closed boolean
  );

  select count(distinct weekday)::int into v_distinct
  from jsonb_to_recordset(p_rows) as x(
    weekday int,
    opens_at time,
    closes_at time,
    is_closed boolean
  );

  if p_barber_id is null and v_count <> 7 then
    raise exception 'BASE_HOURS_REQUIRE_7_ROWS';
  end if;

  if p_barber_id is not null and v_count not in (0,7) then
    raise exception 'OVERRIDE_HOURS_REQUIRE_0_OR_7_ROWS';
  end if;

  if v_count <> v_distinct then
    raise exception 'DUPLICATE_WEEKDAY';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as x(
      weekday int,
      opens_at time,
      closes_at time,
      is_closed boolean
    )
    where weekday not between 0 and 6
       or (not is_closed and closes_at <= opens_at)
  ) then
    raise exception 'INVALID_WORKING_HOURS';
  end if;

  delete from public.working_hours
  where barbershop_id=p_shop
    and (
      (p_barber_id is null and barber_id is null)
      or (p_barber_id is not null and barber_id=p_barber_id)
    );

  insert into public.working_hours(
    barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed
  )
  select p_shop, p_barber_id, x.weekday, x.opens_at, x.closes_at, x.is_closed
  from jsonb_to_recordset(p_rows) as x(
    weekday int,
    opens_at time,
    closes_at time,
    is_closed boolean
  );
end;
$$;

revoke all on function public.replace_working_hours(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_working_hours(uuid,uuid,jsonb) to authenticated;

comment on function public.reorder_services(uuid,uuid[]) is
  'Atomically persists the complete service ordering for one barbershop.';
comment on function public.reorder_haircuts(uuid,uuid[]) is
  'Atomically persists the complete haircut ordering for one barbershop.';
comment on function public.reorder_barbers(uuid,uuid[]) is
  'Atomically persists the complete barber ordering for one barbershop.';
comment on function public.replace_working_hours(uuid,uuid,jsonb) is
  'Atomically replaces one barbershop base schedule or one barber override schedule.';
