-- Phase 2 adds a reviewer foreign key; keep the platform FK index contract intact.
create index if not exists shop_products_image_authorized_by_fk_idx
  on public.shop_products (image_authorized_by);
