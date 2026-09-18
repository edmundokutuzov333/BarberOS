-- BarberOS FASE 25 public RPC benchmark.
-- Read-only and safe for production.
-- Records a representative warm-call median and payload size without writes.

do $phase25$
declare
  v_slug text;
  v_payload_bytes integer;
  v_started timestamptz;
  v_elapsed_ms numeric;
  v_result jsonb;
  v_samples numeric[] := '{}';
  i integer;
begin
  select slug
  into v_slug
  from public.barbershops
  where status in ('trial','active')
  order by created_at
  limit 1;

  if v_slug is null then
    raise notice 'SKIP | no public barbershop fixture available';
    return;
  end if;

  for i in 1..5 loop
    v_started := clock_timestamp();
    v_result := public.get_public_barbershop(v_slug);
    v_elapsed_ms := extract(epoch from (clock_timestamp() - v_started)) * 1000;
    v_samples := array_append(v_samples, v_elapsed_ms);
  end loop;

  select octet_length(v_result::text)
  into v_payload_bytes;

  raise notice 'PHASE25_PUBLIC_RPC slug=% payload_bytes=% samples_ms=%',
    v_slug, v_payload_bytes, v_samples;
end
$phase25$;
