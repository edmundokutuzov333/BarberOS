-- BarberOS | Loja da Barbearia | Fase 4: marcação + pedido atómicos.
-- Reconstruído a partir do schema verificado no staging para repor o artefacto
-- versionado correspondente à migration já registada 20261023124453.
-- A operação não activa a loja e não altera a produção.

alter table public.booking_idempotency
  add column if not exists request_hash text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_idempotency'::regclass
      and conname = 'booking_idempotency_request_hash_format'
  ) then
    alter table public.booking_idempotency
      add constraint booking_idempotency_request_hash_format
      check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$');
  end if;
end;
$migration$;

CREATE OR REPLACE FUNCTION public.book_appointment_with_shop_order_idempotent(p_idempotency_key uuid, p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_shop_items jsonb, p_request_hash text)
 RETURNS TABLE(appointment_id uuid, manage_token uuid, deposit_cents integer, needs_payment boolean, shop_order_status shop_order_status, shop_order_item_count integer, shop_subtotal_minor bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cached jsonb;
  v_cached_hash text;
  v_response jsonb;
  v_cached_shop_order jsonb;
  v_booking record;
  v_shop public.barbershops%rowtype;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_options jsonb;
  v_fulfilment_mode text;
  v_variant record;
  v_order_id uuid;
  v_order_line_id uuid;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_item_count integer := 0;
  v_requested_count integer;
  v_distinct_variants bigint;
  v_reserved integer;
  v_order_status public.shop_order_status;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_FINGERPRINT';
  end if;
  if p_shop_items is null or jsonb_typeof(p_shop_items) is distinct from 'array' then
    raise exception 'INVALID_SHOP_ORDER_ITEMS';
  end if;
  if jsonb_array_length(p_shop_items) > 20 then
    raise exception 'SHOP_ORDER_TOO_MANY_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_shop_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'variant_id')
       or not (v_item ? 'qty')
       or not (v_item ? 'options')
       or not (v_item ? 'fulfilment_mode')
       or exists (
         select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key not in ('variant_id','qty','options','fulfilment_mode')
       ) then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'variant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'qty','') !~ '^[1-9][0-9]{0,2}$'
       or (v_item->>'qty')::integer > 100 then
      raise exception 'INVALID_SHOP_ORDER_QUANTITY';
    end if;
    v_options := v_item->'options';
    if not private.shop_order_options_valid(v_options) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if (select count(*) from jsonb_array_elements_text(v_options) e(value))
       <> (select count(distinct e.value) from jsonb_array_elements_text(v_options) e(value)) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if coalesce(v_item->>'fulfilment_mode','') not in ('consume_here','takeaway') then
      raise exception 'INVALID_SHOP_FULFILMENT_MODE';
    end if;
  end loop;

  select count(*), count(distinct lower(value->>'variant_id'))
    into v_requested_count, v_distinct_variants
  from jsonb_array_elements(p_shop_items);
  if v_requested_count <> v_distinct_variants then
    raise exception 'DUPLICATE_SHOP_ORDER_VARIANT';
  end if;

  -- Claim the same key used by booking-create. Conflicting requests cannot reuse a cached order.
  insert into public.booking_idempotency(key, response, request_hash)
  values (p_idempotency_key, null, p_request_hash)
  on conflict (key) do nothing;

  if not found then
    select bi.response, bi.request_hash
      into v_cached, v_cached_hash
    from public.booking_idempotency bi
    where bi.key = p_idempotency_key
    for update;

    if v_cached is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    if v_cached_hash is null then
      if jsonb_array_length(p_shop_items) > 0 then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
    elsif v_cached_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;

    v_cached_shop_order := v_cached->'shop_order';
    return query
    select
      (v_cached->>'appointment_id')::uuid,
      (v_cached->>'manage_token')::uuid,
      coalesce((v_cached->>'deposit_cents')::integer, 0),
      coalesce((v_cached->>'needs_payment')::boolean, false),
      case
        when v_cached_shop_order is null or v_cached_shop_order = 'null'::jsonb then null::public.shop_order_status
        else (v_cached_shop_order->>'status')::public.shop_order_status
      end,
      coalesce((v_cached_shop_order->>'item_count')::integer, 0),
      coalesce((v_cached_shop_order->>'subtotal_minor')::bigint, 0);
    return;
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    select b.*
      into v_shop
    from public.barbershops b
    where lower(b.slug) = lower(btrim(p_slug))
      and b.status in ('trial','active')
    for update;

    if not found then
      raise exception 'BARBERSHOP_NOT_FOUND';
    end if;
    if not coalesce(v_shop.shop_enabled, false) then
      raise exception 'SHOP_NOT_ENABLED';
    end if;
  end if;

  -- Reuse the existing authoritative engine. Any error below rolls this booking back.
  select * into v_booking
  from public.book_appointment(
    p_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email
  );

  if not found or v_booking.manage_token is null then
    raise exception 'BOOKING_EMPTY_RESPONSE';
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    insert into public.appointment_product_orders(
      barbershop_id, appointment_id, status, customer_note
    )
    values (v_shop.id, v_booking.appointment_id, 'received', null)
    returning id into v_order_id;

    for v_item in select value from jsonb_array_elements(p_shop_items)
    loop
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_qty := (v_item->>'qty')::integer;
      v_options := v_item->'options';
      v_fulfilment_mode := v_item->>'fulfilment_mode';

      select
        v.id as variant_id,
        v.product_id,
        v.barbershop_id,
        v.label as variant_label,
        v.price_minor,
        v.stock_on_hand,
        v.is_active as variant_active,
        p.name as product_name,
        p.is_active as product_active,
        p.category_id,
        p.product_kind,
        p.track_stock,
        p.order_options
      into v_variant
      from public.shop_product_variants v
      join public.shop_products p
        on p.id = v.product_id
       and p.barbershop_id = v.barbershop_id
      where v.id = v_variant_id
        and v.barbershop_id = v_shop.id
        and v.is_active
        and p.is_active
        and (
          p.category_id is null or exists (
            select 1
            from public.shop_product_categories c
            where c.id = p.category_id
              and c.barbershop_id = v_shop.id
              and c.is_active
          )
        )
      for update of v, p;

      if not found then
        raise exception 'SHOP_ITEM_UNAVAILABLE';
      end if;

      if (v_variant.product_kind = 'consume_here' and v_fulfilment_mode <> 'consume_here')
         or (v_variant.product_kind = 'takeaway' and v_fulfilment_mode <> 'takeaway') then
        raise exception 'INVALID_SHOP_FULFILMENT_MODE';
      end if;

      if exists (
        select 1
        from jsonb_array_elements_text(v_options) requested(option_name)
        where not exists (
          select 1
          from jsonb_array_elements_text(v_variant.order_options) configured(option_name)
          where configured.option_name = requested.option_name
        )
      ) then
        raise exception 'INVALID_SHOP_ORDER_OPTIONS';
      end if;

      if v_variant.track_stock then
        select coalesce(sum(r.qty), 0)::integer
          into v_reserved
        from public.inventory_reservations r
        where r.barbershop_id = v_shop.id
          and r.variant_id = v_variant_id
          and r.status = 'reserved'
          and (r.expires_at is null or r.expires_at > now());

        if v_variant.stock_on_hand - v_reserved < v_qty then
          raise exception 'SHOP_STOCK_UNAVAILABLE';
        end if;
      end if;

      if v_variant.price_minor < 0 or v_variant.price_minor > 9007199254740991 then
        raise exception 'SHOP_PRICE_INVALID';
      end if;
      v_line_total := v_variant.price_minor * v_qty;
      if v_subtotal > 9007199254740991 - v_line_total then
        raise exception 'SHOP_TOTAL_OVERFLOW';
      end if;

      insert into public.appointment_product_order_items(
        barbershop_id,
        order_id,
        product_id,
        variant_id,
        product_name_snapshot,
        variant_snapshot,
        unit_price_snapshot,
        qty,
        options,
        line_total_snapshot,
        status
      )
      values (
        v_shop.id,
        v_order_id,
        v_variant.product_id,
        v_variant_id,
        v_variant.product_name,
        v_variant.variant_label,
        v_variant.price_minor,
        v_qty,
        jsonb_build_object('preferences', v_options, 'fulfilment_mode', v_fulfilment_mode),
        v_line_total,
        'requested'
      );

      if v_variant.track_stock then
        insert into public.inventory_reservations(
          barbershop_id, order_id, variant_id, qty, status, expires_at
        )
        values (v_shop.id, v_order_id, v_variant_id, v_qty, 'reserved', null);
      end if;

      v_subtotal := v_subtotal + v_line_total;
      v_item_count := v_item_count + 1;
    end loop;

    if v_item_count <> jsonb_array_length(p_shop_items) or v_item_count = 0 then
      raise exception 'SHOP_ORDER_EMPTY';
    end if;

    v_order_status := 'received';

    insert into public.audit_logs(
      barbershop_id, actor_id, action, entity, entity_id, diff
    )
    values (
      v_shop.id, null, 'shop_order_received', 'appointment_product_order', v_order_id,
      jsonb_build_object(
        'appointment_id', v_booking.appointment_id,
        'item_count', v_item_count,
        'subtotal_minor', v_subtotal,
        'inventory_reservations', (
          select count(*) from public.inventory_reservations r
          where r.order_id = v_order_id and r.status = 'reserved'
        )
      )
    );
  end if;

  v_response := jsonb_build_object(
    'appointment_id', v_booking.appointment_id,
    'manage_token', v_booking.manage_token,
    'deposit_cents', coalesce(v_booking.deposit_cents, 0),
    'needs_payment', coalesce(v_booking.needs_payment, false),
    'shop_order', case when v_order_id is null then null else jsonb_build_object(
      'status', v_order_status::text,
      'item_count', v_item_count,
      'subtotal_minor', v_subtotal
    ) end
  );

  update public.booking_idempotency
  set response = v_response, request_hash = p_request_hash
  where key = p_idempotency_key;

  return query
  select v_booking.appointment_id, v_booking.manage_token, coalesce(v_booking.deposit_cents, 0),
         coalesce(v_booking.needs_payment, false), v_order_status, v_item_count, v_subtotal;
end;
$function$


CREATE OR REPLACE FUNCTION private.shop_appointment_order_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order record;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select o.id, o.status into v_order
    from public.appointment_product_orders o
    where o.appointment_id = new.id and o.barbershop_id = new.barbershop_id
    for update;

    if found and v_order.status not in ('cancelled','failed','delivered') then
      update public.appointment_product_orders
      set status = 'cancelled',
          cancellation_reason = coalesce(nullif(btrim(new.cancel_reason),''),'A marcação associada foi cancelada.')
      where id = v_order.id and barbershop_id = new.barbershop_id;
    end if;
  elsif new.starts_at is distinct from old.starts_at then
    select o.id, o.status into v_order
    from public.appointment_product_orders o
    where o.appointment_id = new.id and o.barbershop_id = new.barbershop_id
    for update;

    if found then
      if v_order.status not in ('received','needs_confirmation','accepted') then
        raise exception 'SHOP_ORDER_RESCHEDULE_REVIEW_REQUIRED';
      end if;
      update public.appointment_product_orders
      set status = case when status = 'received' then 'needs_confirmation' else 'needs_confirmation' end,
          requested_for = new.starts_at
      where id = v_order.id and barbershop_id = new.barbershop_id;
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_shop_order_by_manage_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'status', o.status::text,
    'requested_for', o.requested_for,
    'item_count', count(i.id)::integer,
    'subtotal_minor', coalesce(sum(i.line_total_snapshot), 0)::bigint,
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', i.product_name_snapshot,
          'variant', i.variant_snapshot,
          'qty', i.qty,
          'unit_price_minor', i.unit_price_snapshot,
          'line_total_minor', i.line_total_snapshot,
          'options', i.options,
          'status', i.status::text
        ) order by i.created_at, i.id
      ) filter (where i.id is not null),
      '[]'::jsonb
    )
  )
  from public.appointments a
  join public.appointment_product_orders o
    on o.appointment_id = a.id and o.barbershop_id = a.barbershop_id
  left join public.appointment_product_order_items i
    on i.order_id = o.id and i.barbershop_id = o.barbershop_id
  where a.manage_token = p_token
  group by o.id;
$function$


drop trigger if exists appointments_shop_order_lifecycle on public.appointments;
create trigger appointments_shop_order_lifecycle
after update on public.appointments
for each row execute function private.shop_appointment_order_lifecycle();

revoke all on function public.book_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.book_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text)
  to service_role;

revoke all on function public.get_shop_order_by_manage_token(uuid)
  from public, anon, authenticated;
grant execute on function public.get_shop_order_by_manage_token(uuid)
  to service_role;

revoke all on function private.shop_appointment_order_lifecycle()
  from public, anon, authenticated;
