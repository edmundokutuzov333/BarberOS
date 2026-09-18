
-- BarberOS Phase 4: Availability Engine 2.0
-- Date-specific schedule overrides + strict availability semantics.

create table if not exists public.schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete cascade,
  override_date date not null,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  reason public.block_reason not null default 'other',
  note text,
  created_at timestamptz not null default now(),
  constraint schedule_overrides_closed_hours check (
    (is_closed and opens_at is null and closes_at is null)
    or
    (not is_closed and opens_at is not null and closes_at is not null and closes_at > opens_at)
  ),
  constraint schedule_overrides_note_length check (
    note is null or char_length(note) <= 500
  )
);

create unique index if not exists schedule_overrides_shop_date_unique
  on public.schedule_overrides(barbershop_id, override_date)
  where barber_id is null;

create unique index if not exists schedule_overrides_barber_date_unique
  on public.schedule_overrides(barbershop_id, barber_id, override_date)
  where barber_id is not null;

create index if not exists schedule_overrides_lookup_idx
  on public.schedule_overrides(barbershop_id, override_date, barber_id);

create index if not exists time_blocks_availability_idx
  on public.time_blocks(barbershop_id, barber_id, starts_at, ends_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.working_hours'::regclass and conname='working_hours_weekday_valid'
  ) then
    alter table public.working_hours
      add constraint working_hours_weekday_valid check (weekday between 0 and 6);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.working_hours'::regclass and conname='working_hours_interval_valid'
  ) then
    alter table public.working_hours
      add constraint working_hours_interval_valid
      check (is_closed or closes_at > opens_at);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.time_blocks'::regclass and conname='time_blocks_interval_valid'
  ) then
    alter table public.time_blocks
      add constraint time_blocks_interval_valid check (ends_at > starts_at);
  end if;
end
$$;

alter table public.schedule_overrides enable row level security;

drop policy if exists schedule_overrides_public_read on public.schedule_overrides;
create policy schedule_overrides_public_read
on public.schedule_overrides
for select
to anon, authenticated
using (
  private.shop_is_public(barbershop_id)
  or private.is_member(barbershop_id)
  or private.is_platform_admin()
);

drop policy if exists schedule_overrides_write on public.schedule_overrides;
create policy schedule_overrides_write
on public.schedule_overrides
for all
to authenticated
using (private.is_member(barbershop_id, array['owner','manager']::public.app_role[]))
with check (private.is_member(barbershop_id, array['owner','manager']::public.app_role[]));

drop trigger if exists schedule_overrides_tenant_immutable on public.schedule_overrides;
create trigger schedule_overrides_tenant_immutable
before update of barbershop_id on public.schedule_overrides
for each row execute function private.prevent_tenant_move();

drop trigger if exists schedule_overrides_tenant_integrity on public.schedule_overrides;
create trigger schedule_overrides_tenant_integrity
before insert or update of barbershop_id, barber_id on public.schedule_overrides
for each row execute function private.validate_domain_tenant_integrity();

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
        select 1 from public.barbers b where b.id=new.barber_id
      ) or not exists (
        select 1 from public.services s where s.id=new.service_id
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
           where s.id=new.service_id and s.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'working_hours', 'time_blocks', 'schedule_overrides' then
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'appointments' then
      if not exists (
        select 1 from public.barbers b
        where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if not exists (
        select 1 from public.services s
        where s.id=new.service_id and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if not exists (
        select 1 from public.customers c
        where c.id=new.customer_id and c.barbershop_id=new.barbershop_id
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
        where s.id=new.service_id and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
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
        where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'payments' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'notifications' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.waitlist_entry_id is not null
         and not exists (
           select 1 from public.waitlist_entries w
           where w.id=new.waitlist_entry_id and w.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
  end case;

  return new;
end;
$$;

revoke all on function private.validate_domain_tenant_integrity() from public, anon, authenticated;

create or replace function public.save_schedule_override(
  p_shop uuid,
  p_override_date date,
  p_barber_id uuid default null,
  p_is_closed boolean default true,
  p_opens_at time default null,
  p_closes_at time default null,
  p_reason public.block_reason default 'other',
  p_note text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_timezone text;
begin
  perform private.require_shop_operator(p_shop);

  select timezone into v_timezone
  from public.barbershops
  where id=p_shop;

  if v_timezone is null then
    raise exception 'SHOP_NOT_FOUND';
  end if;

  if p_override_date < (now() at time zone v_timezone)::date then
    raise exception 'OVERRIDE_DATE_IN_PAST';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception 'OVERRIDE_NOTE_TOO_LONG';
  end if;

  if p_barber_id is not null and not exists (
    select 1 from public.barbers
    where id=p_barber_id and barbershop_id=p_shop
  ) then
    raise exception 'TENANT_RELATION_MISMATCH';
  end if;

  if p_is_closed then
    if p_opens_at is not null or p_closes_at is not null then
      raise exception 'CLOSED_OVERRIDE_CANNOT_HAVE_HOURS';
    end if;
  elsif p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'INVALID_OVERRIDE_HOURS';
  end if;

  if p_id is not null then
    update public.schedule_overrides
    set barber_id=p_barber_id,
        override_date=p_override_date,
        is_closed=p_is_closed,
        opens_at=p_opens_at,
        closes_at=p_closes_at,
        reason=p_reason,
        note=nullif(btrim(p_note),'')
    where id=p_id and barbershop_id=p_shop
    returning id into v_id;

    if v_id is null then
      raise exception 'OVERRIDE_NOT_FOUND';
    end if;
  else
    if p_barber_id is null then
      insert into public.schedule_overrides(
        barbershop_id,barber_id,override_date,is_closed,opens_at,closes_at,reason,note
      )
      values (
        p_shop,null,p_override_date,p_is_closed,p_opens_at,p_closes_at,p_reason,nullif(btrim(p_note),'')
      )
      on conflict (barbershop_id,override_date) where barber_id is null
      do update set
        is_closed=excluded.is_closed,
        opens_at=excluded.opens_at,
        closes_at=excluded.closes_at,
        reason=excluded.reason,
        note=excluded.note
      returning id into v_id;
    else
      insert into public.schedule_overrides(
        barbershop_id,barber_id,override_date,is_closed,opens_at,closes_at,reason,note
      )
      values (
        p_shop,p_barber_id,p_override_date,p_is_closed,p_opens_at,p_closes_at,p_reason,nullif(btrim(p_note),'')
      )
      on conflict (barbershop_id,barber_id,override_date) where barber_id is not null
      do update set
        is_closed=excluded.is_closed,
        opens_at=excluded.opens_at,
        closes_at=excluded.closes_at,
        reason=excluded.reason,
        note=excluded.note
      returning id into v_id;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_schedule_override(
  p_shop uuid,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count int;
begin
  perform private.require_shop_operator(p_shop);

  delete from public.schedule_overrides
  where id=p_id and barbershop_id=p_shop;

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.save_schedule_override(uuid,date,uuid,boolean,time,time,public.block_reason,text,uuid)
  from public, anon, authenticated;
revoke all on function public.delete_schedule_override(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.save_schedule_override(uuid,date,uuid,boolean,time,time,public.block_reason,text,uuid) to authenticated;
grant execute on function public.delete_schedule_override(uuid,uuid) to authenticated;

create or replace function public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_barber_id uuid default null,
  p_date date default current_date
)
returns table(slot_start timestamptz, barber_ids uuid[])
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_shop public.barbershops%rowtype;
  v_dur int;
  v_step int;
  v_lead int;
  v_tz text;
  v_today date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_tz := v_shop.timezone;
  v_today := (now() at time zone v_tz)::date;

  if p_date is null then
    raise exception 'INVALID_DATE';
  end if;

  if p_date < v_today then
    return;
  end if;

  if p_date > v_today + v_shop.max_advance_days then
    return;
  end if;

  select s.duration_min into v_dur
  from public.services s
  where s.id=p_service_id
    and s.barbershop_id=v_shop.id
    and s.is_active;

  if not found or v_dur < 5 or v_dur > 480 then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  v_step := v_shop.slot_interval_min;
  v_lead := v_shop.min_lead_time_min;

  if v_step not in (5,10,15,20,30,60) then
    raise exception 'INVALID_SLOT_INTERVAL';
  end if;

  if p_barber_id is not null and not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=v_shop.id
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  return query
  with candidates as (
    select b.id
    from public.barbers b
    join public.barber_services bs
      on bs.barber_id=b.id
     and bs.service_id=p_service_id
    where b.barbershop_id=v_shop.id
      and b.is_active
      and (p_barber_id is null or b.id=p_barber_id)
  ),
  schedule_choice as (
    select
      c.id as barber_id,
      o.id as override_id,
      o.is_closed as override_closed,
      o.opens_at as override_opens_at,
      o.closes_at as override_closes_at,
      bw.opens_at as barber_opens_at,
      bw.closes_at as barber_closes_at,
      bw.is_closed as barber_closed,
      sw.opens_at as shop_opens_at,
      sw.closes_at as shop_closes_at,
      sw.is_closed as shop_closed
    from candidates c
    left join lateral (
      select so.*
      from public.schedule_overrides so
      where so.barbershop_id=v_shop.id
        and so.override_date=p_date
        and (so.barber_id=c.id or so.barber_id is null)
      order by (so.barber_id is not null) desc
      limit 1
    ) o on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id=c.id
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) bw on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id is null
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) sw on true
  ),
  effective_windows as (
    select
      barber_id,
      case
        when override_id is not null then
          case when override_closed then null::time else override_opens_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_opens_at end
        else
          case when shop_closed then null::time else shop_opens_at end
      end as opens_at,
      case
        when override_id is not null then
          case when override_closed then null::time else override_closes_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_closes_at end
        else
          case when shop_closed then null::time else shop_closes_at end
      end as closes_at
    from schedule_choice
  ),
  valid_windows as (
    select
      barber_id,
      ((p_date::timestamp + opens_at) at time zone v_tz) as win_start,
      ((p_date::timestamp + closes_at) at time zone v_tz) as win_end
    from effective_windows
    where opens_at is not null
      and closes_at is not null
      and closes_at > opens_at
  ),
  grid as (
    select
      w.barber_id,
      gs as s,
      gs + make_interval(mins=>v_dur) as e
    from valid_windows w
    cross join lateral generate_series(
      w.win_start,
      w.win_end - make_interval(mins=>v_dur),
      make_interval(mins=>v_step)
    ) gs
  ),
  free_slots as (
    select g.barber_id,g.s
    from grid g
    where g.s >= now() + make_interval(mins=>v_lead)
      and g.s <= now() + make_interval(days=>v_shop.max_advance_days)
      and not exists (
        select 1
        from public.appointments a
        where a.barber_id=g.barber_id
          and (
            a.status in ('confirmed','in_progress')
            or (
              a.status='pending'
              and (a.hold_expires_at is null or a.hold_expires_at > now())
            )
          )
          and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.s,g.e,'[)')
      )
      and not exists (
        select 1
        from public.time_blocks tb
        where tb.barbershop_id=v_shop.id
          and (tb.barber_id is null or tb.barber_id=g.barber_id)
          and tb.ends_at > tb.starts_at
          and tstzrange(tb.starts_at,tb.ends_at,'[)') && tstzrange(g.s,g.e,'[)')
      )
  )
  select fs.s, array_agg(fs.barber_id order by fs.barber_id)
  from free_slots fs
  group by fs.s
  order by fs.s;
end
$$;

create or replace function public.get_available_days(
  p_slug text,
  p_service_id uuid,
  p_barber_id uuid default null,
  p_from date default current_date,
  p_to date default current_date+13
)
returns table(day date, slots_count int, is_open boolean)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_shop public.barbershops%rowtype;
  d date;
  v_today date;
  v_end date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_today := (now() at time zone v_shop.timezone)::date;

  if p_from is null then p_from := v_today; end if;
  if p_to is null then p_to := p_from + 13; end if;

  if p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  p_from := greatest(p_from,v_today);
  v_end := least(p_to,p_from+60,v_today+v_shop.max_advance_days);

  if v_end < p_from then
    return;
  end if;

  for d in
    select generate_series(p_from,v_end,interval '1 day')::date
  loop
    day := d;

    select count(*)::int into slots_count
    from public.get_available_slots(p_slug,p_service_id,p_barber_id,d);

    select exists (
      with candidates as (
        select b.id
        from public.barbers b
        join public.barber_services bs
          on bs.barber_id=b.id
         and bs.service_id=p_service_id
        where b.barbershop_id=v_shop.id
          and b.is_active
          and (p_barber_id is null or b.id=p_barber_id)
      ),
      effective_windows as (
        select
          c.id as barber_id,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.opens_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.opens_at end
            else
              case when sw.is_closed then null::time else sw.opens_at end
          end as opens_at,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.closes_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.closes_at end
            else
              case when sw.is_closed then null::time else sw.closes_at end
          end as closes_at
        from candidates c
        left join lateral (
          select * from public.schedule_overrides so
          where so.barbershop_id=v_shop.id
            and so.override_date=d
            and (so.barber_id=c.id or so.barber_id is null)
          order by (so.barber_id is not null) desc
          limit 1
        ) so on true
        left join lateral (
          select * from public.working_hours bw
          where bw.barbershop_id=v_shop.id
            and bw.barber_id=c.id
            and bw.weekday=extract(dow from d)::int
          limit 1
        ) bw on true
        left join lateral (
          select * from public.working_hours sw
          where sw.barbershop_id=v_shop.id
            and sw.barber_id is null
            and sw.weekday=extract(dow from d)::int
          limit 1
        ) sw on true
      )
      select 1
      from effective_windows ew
      where ew.opens_at is not null
        and ew.closes_at is not null
        and ew.closes_at > ew.opens_at
      limit 1
    ) into is_open;

    return next;
  end loop;
end
$$;

revoke all on function public.get_available_slots(text,uuid,uuid,date) from public;
revoke all on function public.get_available_days(text,uuid,uuid,date,date) from public;
grant execute on function public.get_available_slots(text,uuid,uuid,date) to anon, authenticated;
grant execute on function public.get_available_days(text,uuid,uuid,date,date) to anon, authenticated;

comment on table public.schedule_overrides is
  'Date-specific shop or barber schedule overrides used by the availability engine.';
comment on function public.get_available_slots(text,uuid,uuid,date) is
  'Production availability engine: timezone, service duration, barber scope, date overrides, working hours, lead/advance windows, appointments and time blocks.';
comment on function public.get_available_days(text,uuid,uuid,date,date) is
  'Returns day availability metadata using the same production availability engine as slots.';
