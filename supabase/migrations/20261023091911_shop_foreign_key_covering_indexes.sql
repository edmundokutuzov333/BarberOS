-- Cover every public foreign key introduced by the Loja da Barbearia domain.
-- The invariant is checked by platform_core_contracts.test.sql on an empty database.

create index if not exists shop_order_items_variant_fk_idx
  on public.appointment_product_order_items (variant_id, product_id, barbershop_id);
create index if not exists shop_order_items_order_fk_idx
  on public.appointment_product_order_items (order_id, barbershop_id);
create index if not exists shop_order_items_product_fk_idx
  on public.appointment_product_order_items (product_id, barbershop_id);

create index if not exists shop_orders_accepted_by_fk_idx
  on public.appointment_product_orders (accepted_by);
create index if not exists shop_orders_appointment_fk_idx
  on public.appointment_product_orders (appointment_id, barbershop_id);
create index if not exists shop_orders_cancelled_by_fk_idx
  on public.appointment_product_orders (cancelled_by);
create index if not exists shop_orders_created_by_fk_idx
  on public.appointment_product_orders (created_by);
create index if not exists shop_orders_delivered_by_fk_idx
  on public.appointment_product_orders (delivered_by);
create index if not exists shop_orders_ready_by_fk_idx
  on public.appointment_product_orders (ready_by);

create index if not exists shop_inventory_movements_actor_fk_idx
  on public.inventory_movements (actor_id);
create index if not exists shop_inventory_movements_order_fk_idx
  on public.inventory_movements (order_line_id, barbershop_id);
create index if not exists shop_inventory_movements_variant_fk_idx
  on public.inventory_movements (variant_id, barbershop_id);

create index if not exists shop_inventory_reservations_order_fk_idx
  on public.inventory_reservations (order_id, barbershop_id);
create index if not exists shop_inventory_reservations_variant_fk_idx
  on public.inventory_reservations (variant_id, barbershop_id);

create index if not exists shop_product_categories_created_by_fk_idx
  on public.shop_product_categories (created_by);
create index if not exists shop_product_categories_updated_by_fk_idx
  on public.shop_product_categories (updated_by);

create index if not exists shop_product_variants_created_by_fk_idx
  on public.shop_product_variants (created_by);
create index if not exists shop_product_variants_product_fk_idx
  on public.shop_product_variants (product_id, barbershop_id);
create index if not exists shop_product_variants_updated_by_fk_idx
  on public.shop_product_variants (updated_by);

create index if not exists shop_products_category_fk_idx
  on public.shop_products (category_id, barbershop_id);
create index if not exists shop_products_created_by_fk_idx
  on public.shop_products (created_by);
create index if not exists shop_products_updated_by_fk_idx
  on public.shop_products (updated_by);
