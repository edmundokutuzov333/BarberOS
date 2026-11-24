-- The tenant/reference uniqueness index does not cover reference-key lookups.
-- Cover the foreign key itself for reference maintenance and referential checks.
create index if not exists shop_products_catalog_reference_key_idx
 on public.shop_products(catalog_reference_key);
