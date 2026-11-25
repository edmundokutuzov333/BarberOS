-- Presentation metadata is editable only through the authorized atomic catalogue RPC.
alter table public.shop_products add column gallery jsonb not null default '[]'::jsonb,
 add column is_featured boolean not null default false;
create function private.shop_product_gallery_valid(p_gallery jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
begin
 if jsonb_typeof(p_gallery) is distinct from 'array' then return false;end if;
 if jsonb_array_length(p_gallery)>4 then return false;end if;
 if exists(select 1 from jsonb_array_elements(p_gallery) e where
   jsonb_typeof(e) is distinct from 'object'
   or (e - array['url','alt','source_note'])<>'{}'::jsonb
   or jsonb_typeof(e->'url') is distinct from 'string'
   or jsonb_typeof(e->'alt') is distinct from 'string'
   or jsonb_typeof(e->'source_note') is distinct from 'string'
   or (e->>'url') !~ '^https://[^[:space:]]+$'
   or length(e->>'url')>2048
   or length(btrim(e->>'alt')) not between 1 and 250
   or length(btrim(e->>'source_note')) not between 1 and 500
 ) then return false;end if;
 return (select count(*)=count(distinct e->>'url') from jsonb_array_elements(p_gallery)e);
end $fn$;
revoke all on function private.shop_product_gallery_valid(jsonb) from public,anon;
grant execute on function private.shop_product_gallery_valid(jsonb) to authenticated,service_role;
alter table public.shop_products add constraint shop_products_gallery_valid check(private.shop_product_gallery_valid(gallery));
CREATE OR REPLACE FUNCTION private.invalidate_shop_product_catalog_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.name is distinct from old.name
    or new.brand is distinct from old.brand
    or new.category_id is distinct from old.category_id
    or new.description is distinct from old.description
    or new.image_url is distinct from old.image_url
    or new.image_alt is distinct from old.image_alt
    or new.image_source_url is distinct from old.image_source_url
    or new.image_source_note is distinct from old.image_source_note
    or new.product_kind is distinct from old.product_kind
    or new.track_stock is distinct from old.track_stock
    or new.gallery is distinct from old.gallery then
    new.catalog_verified_at := null;
    new.catalog_verified_by := null;
    new.catalog_verification_note := null;
    if old.is_active then new.is_active := false; end if;
  end if;
  return new;
end;
$function$
;
create trigger shop_product_gallery_verification_invalidation before update of gallery on public.shop_products
 for each row when(old.gallery is distinct from new.gallery) execute function private.invalidate_shop_product_catalog_verification();
create function public.save_shop_catalog_product_presentation(p_barbershop_id uuid,p_product_id uuid,p_payload jsonb,p_gallery jsonb,p_featured boolean,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_existing public.shop_products%rowtype;v_saved public.shop_products%rowtype;
begin
 if auth.uid() is null or not private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) then raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501';end if;
 if p_featured is null or not private.shop_product_gallery_valid(p_gallery) then raise exception 'SHOP_CATALOG_INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_barbershop_id::text||':catalog:'||p_product_id::text,0));
 select * into v_existing from public.shop_products where id=p_product_id and barbershop_id=p_barbershop_id for update;
 if found and (v_existing.gallery is distinct from p_gallery or v_existing.is_featured is distinct from p_featured)
   and v_existing.updated_at is distinct from p_expected_updated_at then raise exception 'SHOP_CATALOG_CONFLICT' using errcode='40001';end if;
 perform public.save_shop_catalog_product(p_barbershop_id,p_product_id,p_payload,p_expected_updated_at);
 update public.shop_products set gallery=p_gallery,is_featured=p_featured
 where id=p_product_id and barbershop_id=p_barbershop_id
 and (gallery is distinct from p_gallery or is_featured is distinct from p_featured);
 select * into strict v_saved from public.shop_products where id=p_product_id and barbershop_id=p_barbershop_id;
 return to_jsonb(v_saved);
end $fn$;
revoke all on function public.save_shop_catalog_product_presentation(uuid,uuid,jsonb,jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.save_shop_catalog_product_presentation(uuid,uuid,jsonb,jsonb,boolean,timestamptz) to authenticated;
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
        order by p.is_featured desc, p.sort_order, p.name
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
-- Keep the old JSON contract stable. V2 adds only public presentation data.
create function public.get_public_shop_catalog_v2(p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare v_catalog jsonb:=public.get_public_shop_catalog(p_slug);
begin
 return jsonb_set(v_catalog,'{products}',coalesce((
  select jsonb_agg(e.value||jsonb_build_object('is_featured',p.is_featured,'gallery',coalesce((
    select jsonb_agg(jsonb_build_object('url',g.value->>'url','alt',g.value->>'alt') order by g.ordinality)
    from jsonb_array_elements(p.gallery) with ordinality g(value,ordinality)
  ),'[]'::jsonb)) order by e.ordinality)
  from jsonb_array_elements(v_catalog->'products') with ordinality e(value,ordinality)
  join public.shop_products p on p.id=(e.value->>'id')::uuid
 ),'[]'::jsonb));
end $fn$;
revoke all on function public.get_public_shop_catalog_v2(text) from public;
grant execute on function public.get_public_shop_catalog_v2(text) to anon,authenticated,service_role;
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
    product_kind, track_stock, is_active, sort_order, order_options, gallery
  ) values (
    p_barbershop_id, v_source.category_id, v_source.brand,
    left(v_source.name || ' (cópia)', 160), v_source.description,
    v_source.image_url, v_source.image_alt, v_source.image_source_url, v_source.image_source_note,
    v_source.product_kind, v_source.track_stock, false,
    coalesce((select max(p.sort_order)+1 from public.shop_products p where p.barbershop_id=p_barbershop_id),0),
    v_source.order_options, v_source.gallery
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
CREATE OR REPLACE FUNCTION public.get_shop_phase6_report(p_barbershop_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; v_from timestamptz; v_to timestamptz;
begin
 if auth.uid() is null or not (private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or private.is_platform_admin())
 then raise exception 'SHOP_REPORT_FORBIDDEN' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'SHOP_REPORT_INVALID_RANGE'; end if;
 v_from:=p_from::timestamp at time zone 'Africa/Maputo'; v_to:=(p_to+1)::timestamp at time zone 'Africa/Maputo';
 select jsonb_build_object(
  'from',p_from,'to',p_to,
  'orders_received',count(*) filter(where o.created_at>=v_from and o.created_at<v_to),
  'orders_accepted',count(*) filter(where o.accepted_at>=v_from and o.accepted_at<v_to),
  'orders_ready',count(*) filter(where o.ready_at>=v_from and o.ready_at<v_to),
  'orders_delivered',count(*) filter(where o.delivered_at>=v_from and o.delivered_at<v_to),
  'orders_cancelled',count(*) filter(where o.cancelled_at>=v_from and o.cancelled_at<v_to),
  'items_requested',coalesce((select sum(i.qty) from public.appointment_product_order_items i join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
  'items_delivered',coalesce((select sum(i.delivered_qty) from public.appointment_product_order_items i join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
  'low_stock_variants',(select count(*) from public.shop_product_variants v join public.shop_products p on p.id=v.product_id and p.barbershop_id=v.barbershop_id where v.barbershop_id=p_barbershop_id and p.is_active and v.is_active and p.track_stock and v.stock_on_hand<=v.low_stock_threshold),
  'unread_internal_alerts',(select count(*) from public.shop_notification_events n where n.barbershop_id=p_barbershop_id and n.read_at is null),
  'external_provider_failures',(select count(*) from public.shop_notification_events n where n.barbershop_id=p_barbershop_id and n.delivery_channel in ('email','whatsapp') and n.delivery_status='failed' and n.occurred_at>=v_from and n.occurred_at<v_to),
  'paid_revenue_minor',coalesce((select sum(p.amount_minor) from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.confirmed_at>=v_from and p.confirmed_at<v_to),0),
  'paid_revenue_status','staff_confirmed_shop_payments_not_provider_reconciled',
  'payment_records_count',(select count(*) from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.confirmed_at>=v_from and p.confirmed_at<v_to),
  'payment_note','Registos confirmados por owner/manager e associados a artigos entregues. Não são reconciliação automática com M-Pesa, e-Mola, POS ou banco; os providers têm de ser verificados separadamente.'
 ) into v_result from public.appointment_product_orders o where o.barbershop_id=p_barbershop_id;
 -- Date range follows the existing order-created cohort, not cash settlement.
 select v_result || jsonb_build_object(
  'delivered_cost_known_units',coalesce(sum(i.delivered_qty) filter(where i.unit_cost_snapshot is not null),0),
  'delivered_cost_unknown_units',coalesce(sum(i.delivered_qty) filter(where i.unit_cost_snapshot is null),0),
  'delivered_known_cost_minor',sum(i.unit_cost_snapshot*i.delivered_qty) filter(where i.delivered_qty>0 and i.unit_cost_snapshot is not null),
  'delivered_known_gross_margin_minor',sum((i.unit_price_snapshot-i.unit_cost_snapshot)*i.delivered_qty) filter(where i.delivered_qty>0 and i.unit_cost_snapshot is not null)
 ) into v_result
 from public.appointment_product_order_items i
 join public.appointment_product_orders o on o.id=i.order_id and o.barbershop_id=i.barbershop_id
 where i.barbershop_id=p_barbershop_id and o.created_at>=v_from and o.created_at<v_to;
 return v_result;
end;
$function$
;
