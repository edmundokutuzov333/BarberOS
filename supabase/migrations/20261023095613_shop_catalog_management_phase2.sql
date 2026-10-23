-- BarberOS | Loja da Barbearia | Fase 2: permissões do catálogo.
-- Keep tenant identity and stock balances immutable from direct browser updates.
grant update (name, description, sort_order, is_active)
  on public.shop_product_categories to authenticated;

grant update (category_id, brand, name, description, image_url, image_alt,
  image_source_url, image_source_note, image_source_checked_at, product_kind,
  track_stock, is_active, sort_order)
  on public.shop_products to authenticated;

grant update (sku, label, attributes, unit_label, price_minor,
  low_stock_threshold, is_active)
  on public.shop_product_variants to authenticated;

-- Stock changes must pass through record_shop_inventory_movement, which writes
-- an immutable ledger entry and updates stock in the same transaction.
revoke update (barbershop_id, created_by, created_at, updated_at)
  on public.shop_product_categories from authenticated;
revoke update (barbershop_id, product_id, created_by, created_at, updated_at, stock_on_hand)
  on public.shop_product_variants from authenticated;
revoke update (barbershop_id, created_by, created_at, updated_at)
  on public.shop_products from authenticated;
