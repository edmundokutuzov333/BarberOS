-- Align the public Oryon showcase with the current BarberOS noir/brass visual identity.
-- Idempotent by design; existing tenant-selected themes are otherwise untouched.
UPDATE public.barbershops
SET theme_key = 'noir-brass'
WHERE slug = 'oryon'
  AND status = 'active'
  AND theme_key IS DISTINCT FROM 'noir-brass';
