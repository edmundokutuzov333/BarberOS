-- Recurring working-hour breaks and authoritative effective catalogue prices.
alter table public.working_hours add column break_start time, add column break_end time;
alter table public.working_hours add constraint working_hours_break_valid check (
 (break_start is null and break_end is null) or
 (not is_closed and break_start is not null and break_end is not null and opens_at<=break_start and break_start<break_end and break_end<=closes_at)
);
alter table public.shop_product_variants add column regular_price_minor bigint, add column cost_minor bigint;
alter table public.shop_product_variants add constraint shop_variant_regular_price_valid check (regular_price_minor is null or (regular_price_minor>price_minor and regular_price_minor<=1000000000)),
 add constraint shop_variant_cost_valid check (cost_minor is null or cost_minor between 0 and 1000000000);
grant select(regular_price_minor,cost_minor), insert(regular_price_minor,cost_minor), update(regular_price_minor,cost_minor) on public.shop_product_variants to authenticated;
alter table public.appointment_product_order_items add column unit_cost_snapshot bigint check (unit_cost_snapshot is null or unit_cost_snapshot>=0);
-- Cost is never included in public catalogue or manage-token response. Existing orders keep NULL.
create function private.snapshot_shop_order_unit_cost() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 select v.cost_minor into new.unit_cost_snapshot from public.shop_product_variants v
 where v.id=new.variant_id and v.product_id=new.product_id and v.barbershop_id=new.barbershop_id;
 return new;
end
$fn$;
revoke all on function private.snapshot_shop_order_unit_cost() from public,anon,authenticated;
create trigger shop_order_snapshot_cost before insert on public.appointment_product_order_items for each row execute function private.snapshot_shop_order_unit_cost();
CREATE OR REPLACE FUNCTION public.replace_working_hours(p_shop uuid, p_rows jsonb, p_barber_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Preserve existing pauses when older clients omit the new keys.
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'break_start', case when e.value ? 'break_start' then e.value->'break_start' else to_jsonb(w.break_start) end,
    'break_end', case when e.value ? 'break_end' then e.value->'break_end' else to_jsonb(w.break_end) end
  ) order by e.ordinality),'[]'::jsonb) into p_rows
  from jsonb_array_elements(p_rows) with ordinality e(value,ordinality)
  left join public.working_hours w on w.barbershop_id=p_shop
    and w.barber_id is not distinct from p_barber_id and w.weekday=(e.value->>'weekday')::int;

  delete from public.working_hours
  where barbershop_id=p_shop
    and (
      (p_barber_id is null and barber_id is null)
      or (p_barber_id is not null and barber_id=p_barber_id)
    );

  insert into public.working_hours(
    barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed, break_start, break_end
  )
  select p_shop, p_barber_id, x.weekday, x.opens_at, x.closes_at, x.is_closed, case when x.is_closed then null else x.break_start end, case when x.is_closed then null else x.break_end end
  from jsonb_to_recordset(p_rows) as x(
    weekday int,
    opens_at time,
    closes_at time,
    is_closed boolean,
    break_start time,
    break_end time
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.available_slots_for_duration(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_duration_min integer, p_exclude_appointment uuid)
 RETURNS TABLE(slot_start timestamp with time zone, barber_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_dur := coalesce(p_duration_min,v_dur);
  if v_dur not between 5 and 480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
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
          and a.id is distinct from p_exclude_appointment
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
        select 1 from public.working_hours pause
        where pause.barbershop_id=v_shop.id
          and pause.weekday=extract(dow from p_date)::int
          and (pause.barber_id is null or pause.barber_id=g.barber_id)
          and not pause.is_closed and pause.break_start is not null
          and tstzrange((p_date+pause.break_start) at time zone v_tz,
                        (p_date+pause.break_end) at time zone v_tz,'[)') && tstzrange(g.s,g.e,'[)')
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_public_shop_catalog(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  v_payload jsonb;
begin
  if p_slug is null or length(btrim(p_slug)) not between 1 and 120 then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select b.*
    into v_shop
    from public.barbershops b
   where lower(b.slug) = lower(btrim(p_slug))
     and b.status in ('trial', 'active')
   limit 1;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  -- Keep the public API predictable while the tenant-level shop flag is off.
  if not coalesce(v_shop.shop_enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'categories', '[]'::jsonb,
      'products', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'enabled', true,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'sort_order', c.sort_order
        )
        order by c.sort_order, c.name
      )
      from public.shop_product_categories c
      where c.barbershop_id = v_shop.id
        and c.is_active
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'category_id', p.category_id,
          'brand', p.brand,
          'name', p.name,
          'description', p.description,
          'image_url', p.image_url,
          'image_alt', p.image_alt,
          'product_kind', p.product_kind,
          'sort_order', p.sort_order,
          'order_options', p.order_options,
          'variants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'label', v.label,
                'attributes', (v.attributes - 'regular_price_minor') || jsonb_build_object('requires_confirmation',p.requires_confirmation,'regular_price_minor',v.regular_price_minor),
                'unit_label', v.unit_label,
                'price_minor', v.price_minor,
                'available',
                  case
                    when not p.track_stock then true
                    else v.stock_on_hand - coalesce((
                      select sum(r.qty)
                      from public.inventory_reservations r
                      where r.barbershop_id = v_shop.id
                        and r.variant_id = v.id
                        and r.status = 'reserved'
                        and (r.expires_at is null or r.expires_at > now())
                    ), 0) > 0
                  end
              )
              order by v.created_at, v.id
            )
            from public.shop_product_variants v
            where v.barbershop_id = v_shop.id
              and v.product_id = p.id
              and v.is_active
          ), '[]'::jsonb)
        )
        order by p.sort_order, p.name
      )
      from public.shop_products p
      where p.barbershop_id = v_shop.id
        and p.is_active
        and (p.category_id is null or exists (
          select 1
          from public.shop_product_categories c
          where c.id = p.category_id
            and c.barbershop_id = v_shop.id
            and c.is_active
        ))
        and exists (
          select 1
          from public.shop_product_variants v
          where v.barbershop_id = v_shop.id
            and v.product_id = p.id
            and v.is_active
        )
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.duplicate_shop_product(p_barbershop_id uuid, p_product_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.shop_products%rowtype;
  v_new_id uuid;
  v_variant record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform private.require_shop_operator(p_barbershop_id);
  end if;

  select p.* into v_source
  from public.shop_products p
  where p.id = p_product_id and p.barbershop_id = p_barbershop_id;
  if not found then
    raise exception 'SHOP_PRODUCT_NOT_FOUND';
  end if;

  insert into public.shop_products (
    barbershop_id, category_id, brand, name, description,
    image_url, image_alt, image_source_url, image_source_note,
    product_kind, track_stock, is_active, sort_order, order_options
  ) values (
    p_barbershop_id, v_source.category_id, v_source.brand,
    left(v_source.name || ' (cópia)', 160), v_source.description,
    v_source.image_url, v_source.image_alt, v_source.image_source_url, v_source.image_source_note,
    v_source.product_kind, v_source.track_stock, false,
    coalesce((select max(p.sort_order)+1 from public.shop_products p where p.barbershop_id=p_barbershop_id),0),
    v_source.order_options
  ) returning id into v_new_id;

  for v_variant in
    select v.label, v.attributes, v.unit_label, v.price_minor, v.regular_price_minor, v.cost_minor, v.low_stock_threshold
    from public.shop_product_variants v
    where v.product_id=p_product_id and v.barbershop_id=p_barbershop_id
    order by v.created_at, v.id
  loop
    insert into public.shop_product_variants (
      barbershop_id, product_id, sku, label, attributes, unit_label,
      price_minor, regular_price_minor, cost_minor, low_stock_threshold, is_active
    ) values (
      p_barbershop_id, v_new_id, null, v_variant.label, v_variant.attributes,
      v_variant.unit_label, v_variant.price_minor, v_variant.regular_price_minor, v_variant.cost_minor, v_variant.low_stock_threshold, false
    );
  end loop;
  return v_new_id;
end;
$function$
;
-- Normal price changes also require the existing catalogue approval workflow.
create trigger shop_variant_regular_price_reverify after update of regular_price_minor on public.shop_product_variants for each row
 when (old.regular_price_minor is distinct from new.regular_price_minor and old.price_minor is not distinct from new.price_minor)
 execute function private.invalidate_shop_catalog_verification_from_variant();
