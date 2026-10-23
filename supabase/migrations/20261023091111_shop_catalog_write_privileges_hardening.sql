-- Fase 1 hardening: catalog write privileges. Never let authenticated clients write balances.
revoke insert, delete on public.shop_product_categories, public.shop_products, public.shop_product_variants from authenticated;

grant insert (barbershop_id, name, description, sort_order, is_active)
 on public.shop_product_categories to authenticated;

grant insert (barbershop_id, category_id, brand, name, description, image_url, image_alt,
 image_source_url, image_source_checked_at, product_kind, track_stock, is_active, sort_order)
 on public.shop_products to authenticated;

grant insert (barbershop_id, product_id, sku, label, attributes, unit_label, price_minor,
 low_stock_threshold, is_active)
 on public.shop_product_variants to authenticated;
