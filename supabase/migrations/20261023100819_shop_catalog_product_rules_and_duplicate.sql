-- Phase 2 catalogue rules: allowed customer preferences and safe product duplication.
create or replace function private.shop_order_options_valid(p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_options) > 10 then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(p_options) as option_value(value)
    where jsonb_typeof(option_value.value) <> 'string'
       or length(btrim(option_value.value #>> '{}')) not between 1 and 80
  );
end;
$$;

alter table public.shop_products
  add column if not exists order_options jsonb not null default '[]'::jsonb;
alter table public.shop_products
  drop constraint if exists shop_products_order_options_valid;
alter table public.shop_products
  add constraint shop_products_order_options_valid
  check (private.shop_order_options_valid(order_options));

grant insert (order_options) on public.shop_products to authenticated;
grant update (order_options) on public.shop_products to authenticated;
grant select (order_options) on public.shop_products to anon;

create or replace function public.duplicate_shop_product(p_barbershop_id uuid, p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.shop_products%rowtype;
  v_new_id uuid;
  v_variant record;
begin
  perform private.require_shop_operator(p_barbershop_id);

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
    select v.label, v.attributes, v.unit_label, v.price_minor, v.low_stock_threshold
    from public.shop_product_variants v
    where v.product_id=p_product_id and v.barbershop_id=p_barbershop_id
    order by v.created_at, v.id
  loop
    insert into public.shop_product_variants (
      barbershop_id, product_id, sku, label, attributes, unit_label,
      price_minor, low_stock_threshold, is_active
    ) values (
      p_barbershop_id, v_new_id, null, v_variant.label, v_variant.attributes,
      v_variant.unit_label, v_variant.price_minor, v_variant.low_stock_threshold, false
    );
  end loop;

  return v_new_id;
end;
$$;

revoke all on function private.shop_order_options_valid(jsonb) from public, anon, authenticated;
revoke all on function public.duplicate_shop_product(uuid,uuid) from public, anon;
grant execute on function public.duplicate_shop_product(uuid,uuid) to authenticated;
