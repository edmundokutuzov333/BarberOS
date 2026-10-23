-- BarberOS | Loja da Barbearia | Fase 3: catálogo público seguro.
-- Public read DTO only. This does not create orders or change the booking transaction.
create or replace function public.get_public_shop_catalog(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
                'attributes', v.attributes,
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
$$;

revoke all on function public.get_public_shop_catalog(text) from public, anon, authenticated;
grant execute on function public.get_public_shop_catalog(text) to anon, authenticated, service_role;

comment on function public.get_public_shop_catalog(text) is
  'Public, tenant-scoped catalogue DTO. Omits inventory quantities, private image approval metadata and customer/appointment data. Does not create orders.';
