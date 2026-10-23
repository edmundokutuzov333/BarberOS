select r.appointment_id
from private.phase4_concurrency_fixture f
cross join lateral public.book_appointment_with_shop_order_idempotent(
  f.key_a, f.slug, f.service_id, null, null, f.slot_a,
  'Cliente Fase 4 Race A', '84 000 0074', 'phase4-race-a@example.com',
  jsonb_build_array(jsonb_build_object(
    'variant_id', f.variant_id, 'qty', 1, 'options', '[]'::jsonb, 'fulfilment_mode', 'consume_here'
  )),
  repeat('a', 64)
) r
where f.singleton;
