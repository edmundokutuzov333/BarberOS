-- BarberOS FASE 25 performance contract.
-- Read-only.

do $phase25$
declare
  v_missing text[];
begin
  select array_agg(name order by name)
  into v_missing
  from (
    select 'services_public_shop_order_idx' as name
    where not exists (
      select 1 from pg_indexes
      where schemaname='public' and indexname='services_public_shop_order_idx'
    )
    union all
    select 'haircuts_public_shop_order_idx'
    where not exists (
      select 1 from pg_indexes
      where schemaname='public' and indexname='haircuts_public_shop_order_idx'
    )
    union all
    select 'barbers_public_shop_order_idx'
    where not exists (
      select 1 from pg_indexes
      where schemaname='public' and indexname='barbers_public_shop_order_idx'
    )
    union all
    select 'reviews_public_shop_created_idx'
    where not exists (
      select 1 from pg_indexes
      where schemaname='public' and indexname='reviews_public_shop_created_idx'
    )
  ) missing;

  if v_missing is not null then
    raise exception 'PHASE25_PUBLIC_INDEXES_MISSING:%', array_to_string(v_missing, ',');
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_public_barbershop'
  ) then
    raise exception 'PHASE25_PUBLIC_RPC_MISSING';
  end if;

  raise notice 'PASS | Phase 25 public performance database contract';
end
$phase25$;
