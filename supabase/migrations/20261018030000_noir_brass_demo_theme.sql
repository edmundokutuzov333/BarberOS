-- Make the tenant immutability guard safe for tables which do not own a barbershop_id column.
-- The guard is attached to several tenant-owned tables. Serializing the row avoids a field lookup error
-- on the barbershops table while preserving the immutability check for all tables that have that field.
CREATE OR REPLACE FUNCTION private.prevent_tenant_reparent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  new_row jsonb;
  old_row jsonb;
BEGIN
  IF tg_op = 'UPDATE' THEN
    new_row := to_jsonb(new);
    old_row := to_jsonb(old);
    IF new_row ? 'barbershop_id'
       AND (new_row -> 'barbershop_id') IS DISTINCT FROM (old_row -> 'barbershop_id')
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
      RAISE EXCEPTION 'TENANT_IMMUTABLE';
    END IF;
  END IF;
  RETURN new;
END;
$function$;

-- Align the public Oryon showcase with the current BarberOS noir/brass visual identity.
-- Idempotent by design; other tenants' selected themes are left unchanged.
UPDATE public.barbershops
SET theme_key = 'noir-brass'
WHERE slug = 'oryon'
  AND status = 'active'
  AND theme_key IS DISTINCT FROM 'noir-brass';
