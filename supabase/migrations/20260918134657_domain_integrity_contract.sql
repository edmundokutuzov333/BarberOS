
-- Phase 3 contract correction: make barber scope optional for the base schedule.

drop function if exists public.replace_working_hours(uuid,uuid,jsonb);

create function public.replace_working_hours(
  p_shop uuid,
  p_rows jsonb,
  p_barber_id uuid default null
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

revoke all on function public.replace_working_hours(uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.replace_working_hours(uuid,jsonb,uuid) to authenticated;

comment on function public.replace_working_hours(uuid,jsonb,uuid) is
  'Atomically replaces one barbershop base schedule or one barber override schedule.';
