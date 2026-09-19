-- BarberOS FASE 25: public surface performance indexes.
-- Accelerate tenant-scoped reads used by the public barbershop RPC.
-- No domain behaviour or public data contract is changed.

create index if not exists services_public_shop_order_idx
  on public.services (barbershop_id, sort_order, name)
  where is_active;

create index if not exists haircuts_public_shop_order_idx
  on public.haircuts (barbershop_id, sort_order, name)
  where is_active;

create index if not exists barbers_public_shop_order_idx
  on public.barbers (barbershop_id, sort_order, display_name)
  where is_active;

create index if not exists reviews_public_shop_created_idx
  on public.reviews (barbershop_id, created_at desc)
  where is_published;

comment on index public.services_public_shop_order_idx is
  'Public barbershop service list support for get_public_barbershop().';

comment on index public.haircuts_public_shop_order_idx is
  'Public barbershop haircut list support for get_public_barbershop().';

comment on index public.barbers_public_shop_order_idx is
  'Public barbershop team list support for get_public_barbershop().';

comment on index public.reviews_public_shop_created_idx is
  'Public latest published reviews support for get_public_barbershop().';
