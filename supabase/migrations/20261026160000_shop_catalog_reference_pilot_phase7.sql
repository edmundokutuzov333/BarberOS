-- BarberOS | Loja da Barbearia | Fase 7: catálogo de referência e preparação do piloto.
-- No reference products, prices, SKUs or images are seeded. A real owner/manager must
-- verify the physical item, price/stock, and image rights before publication.

-- The Phase 6 inbox has two independent foreign keys which each need an index.
create index if not exists shop_notification_events_order_id_fk_idx
  on public.shop_notification_events(order_id);
create index if not exists shop_notification_events_read_by_fk_idx
  on public.shop_notification_events(read_by);

alter table public.shop_products
  add column if not exists catalog_verified_at timestamptz,
  add column if not exists catalog_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists catalog_verification_note text
    check (catalog_verification_note is null or length(btrim(catalog_verification_note)) between 20 and 500);
create index if not exists shop_products_catalog_verified_by_fk_idx
  on public.shop_products(catalog_verified_by);

revoke insert (catalog_verified_at, catalog_verified_by, catalog_verification_note)
  on public.shop_products from authenticated;
revoke update (catalog_verified_at, catalog_verified_by, catalog_verification_note)
  on public.shop_products from authenticated;

-- Fail closed: previously published, unverified products remain in history but
-- must be reviewed again before they can be eligible for a public catalogue.
update public.shop_products
set is_active = false
where is_active
  and (catalog_verified_at is null or catalog_verified_by is null or catalog_verification_note is null);

create or replace function private.invalidate_shop_product_catalog_verification()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.name is distinct from old.name
    or new.brand is distinct from old.brand
    or new.category_id is distinct from old.category_id
    or new.description is distinct from old.description
    or new.image_url is distinct from old.image_url
    or new.image_alt is distinct from old.image_alt
    or new.image_source_url is distinct from old.image_source_url
    or new.image_source_note is distinct from old.image_source_note
    or new.product_kind is distinct from old.product_kind
    or new.track_stock is distinct from old.track_stock then
    new.catalog_verified_at := null;
    new.catalog_verified_by := null;
    new.catalog_verification_note := null;
    if old.is_active then new.is_active := false; end if;
  end if;
  return new;
end;
$function$;

create or replace function private.invalidate_shop_catalog_verification_from_variant()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    update public.shop_products p
      set catalog_verified_at = null, catalog_verified_by = null,
          catalog_verification_note = null, is_active = false
    where p.id = old.product_id and p.barbershop_id = old.barbershop_id
      and p.catalog_verified_at is not null;
  end if;
  if tg_op = 'DELETE' then
    update public.shop_products p
      set catalog_verified_at = null, catalog_verified_by = null,
          catalog_verification_note = null, is_active = false
    where p.id = old.product_id and p.barbershop_id = old.barbershop_id
      and p.catalog_verified_at is not null;
    return old;
  else
    update public.shop_products p
      set catalog_verified_at = null, catalog_verified_by = null,
          catalog_verification_note = null, is_active = false
    where p.id = new.product_id and p.barbershop_id = new.barbershop_id
      and p.catalog_verified_at is not null;
    return new;
  end if;
end;
$function$;

revoke all on function private.invalidate_shop_product_catalog_verification() from public, anon, authenticated;
revoke all on function private.invalidate_shop_catalog_verification_from_variant() from public, anon, authenticated;

drop trigger if exists shop_product_catalog_verification_invalidation on public.shop_products;
create trigger shop_product_catalog_verification_invalidation
before update of name, brand, category_id, description, image_url, image_alt,
  image_source_url, image_source_note, product_kind, track_stock
on public.shop_products for each row
execute function private.invalidate_shop_product_catalog_verification();

drop trigger if exists shop_product_variant_catalog_verification_after_insert_delete on public.shop_product_variants;
create trigger shop_product_variant_catalog_verification_after_insert_delete
after insert or delete on public.shop_product_variants for each row
execute function private.invalidate_shop_catalog_verification_from_variant();

drop trigger if exists shop_product_variant_catalog_verification_after_update on public.shop_product_variants;
create trigger shop_product_variant_catalog_verification_after_update
after update of product_id, barbershop_id, sku, label, attributes, unit_label, price_minor, is_active
on public.shop_product_variants for each row
execute function private.invalidate_shop_catalog_verification_from_variant();

create or replace function private.shop_product_publication_guard()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.is_active and (
    tg_op = 'INSERT'
    or old.is_active is distinct from new.is_active
    or old.name is distinct from new.name
    or old.brand is distinct from new.brand
    or old.category_id is distinct from new.category_id
    or old.description is distinct from new.description
    or old.image_url is distinct from new.image_url
    or old.image_alt is distinct from new.image_alt
    or old.image_source_url is distinct from new.image_source_url
    or old.image_source_note is distinct from new.image_source_note
    or old.product_kind is distinct from new.product_kind
    or old.track_stock is distinct from new.track_stock
  ) then
    if new.category_id is not null and not exists (
      select 1 from public.shop_product_categories c
      where c.id = new.category_id and c.barbershop_id = new.barbershop_id and c.is_active
    ) then raise exception 'SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED'; end if;
    if not exists (
      select 1 from public.shop_product_variants v
      where v.product_id = new.id and v.barbershop_id = new.barbershop_id and v.is_active
    ) then raise exception 'SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT'; end if;
    if new.catalog_verified_at is null or new.catalog_verified_by is null
      or new.catalog_verification_note is null then
      raise exception 'SHOP_PRODUCT_CATALOG_NOT_VERIFIED';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists shop_product_publication_guard on public.shop_products;
create trigger shop_product_publication_guard
before insert or update of is_active, name, brand, category_id, description, image_url, image_alt,
  image_source_url, image_source_note, product_kind, track_stock
on public.shop_products for each row
execute function private.shop_product_publication_guard();
revoke all on function private.shop_product_publication_guard() from public, anon, authenticated;

create or replace function public.verify_shop_catalog_product(
  p_barbershop_id uuid, p_product_id uuid, p_verification_note text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_product public.shop_products%rowtype; v_verified_at timestamptz;
begin
  if auth.uid() is null or not public.is_member(
    p_barbershop_id, array['owner','manager']::public.app_role[]
  ) then raise exception 'SHOP_CATALOG_VERIFY_FORBIDDEN' using errcode = '42501'; end if;
  if p_verification_note is null or length(btrim(p_verification_note)) not between 20 and 500 then
    raise exception 'SHOP_CATALOG_VERIFICATION_NOTE_REQUIRED';
  end if;

  select p.* into v_product from public.shop_products p
    where p.id = p_product_id and p.barbershop_id = p_barbershop_id for update;
  if not found then raise exception 'SHOP_CATALOG_PRODUCT_NOT_FOUND'; end if;

  if v_product.image_url is null or v_product.image_alt is null
    or v_product.image_source_note is null or v_product.image_source_checked_at is null
    or v_product.image_authorized_by is null or v_product.image_authorized_at is null then
    raise exception 'SHOP_CATALOG_IMAGE_NOT_APPROVED';
  end if;
  if v_product.image_source_url is not null and v_product.image_source_url !~ '^https://' then
    raise exception 'SHOP_CATALOG_IMAGE_SOURCE_INVALID';
  end if;
  if v_product.category_id is not null and not exists (
    select 1 from public.shop_product_categories c
    where c.id = v_product.category_id and c.barbershop_id = p_barbershop_id and c.is_active
  ) then raise exception 'SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED'; end if;
  if not exists (
    select 1 from public.shop_product_variants v
    where v.product_id = v_product.id and v.barbershop_id = p_barbershop_id and v.is_active
  ) then raise exception 'SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT'; end if;
  if v_product.track_stock and not exists (
    select 1 from public.shop_product_variants v
    where v.product_id = v_product.id and v.barbershop_id = p_barbershop_id
      and v.is_active and v.stock_on_hand > 0
  ) then raise exception 'SHOP_CATALOG_STOCK_UNAVAILABLE'; end if;

  v_verified_at := clock_timestamp();
  update public.shop_products p set catalog_verified_at = v_verified_at,
    catalog_verified_by = auth.uid(), catalog_verification_note = btrim(p_verification_note)
  where p.id = p_product_id and p.barbershop_id = p_barbershop_id;
  return jsonb_build_object('product_id',p_product_id,'catalog_verified_at',v_verified_at,'catalog_verified_by',auth.uid());
end;
$function$;
revoke all on function public.verify_shop_catalog_product(uuid,uuid,text) from public, anon;
grant execute on function public.verify_shop_catalog_product(uuid,uuid,text) to authenticated;

create or replace function public.get_shop_phase7_catalog_readiness(p_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_total bigint; v_active bigint; v_verified bigint; v_unverified_active bigint;
  v_missing_photo bigint; v_missing_provenance bigint; v_no_variant bigint;
  v_out_of_stock bigint; v_shop_enabled boolean; v_result jsonb;
begin
  if auth.uid() is null or not public.is_member(
    p_barbershop_id, array['owner','manager']::public.app_role[]
  ) then raise exception 'SHOP_CATALOG_READINESS_FORBIDDEN' using errcode = '42501'; end if;
  select b.shop_enabled into v_shop_enabled from public.barbershops b where b.id = p_barbershop_id;
  if not found then raise exception 'SHOP_CATALOG_READINESS_FORBIDDEN' using errcode = '42501'; end if;

  select count(*) into v_total from public.shop_products p where p.barbershop_id = p_barbershop_id;
  select count(*) into v_active from public.shop_products p where p.barbershop_id = p_barbershop_id and p.is_active;
  select count(*) into v_verified from public.shop_products p where p.barbershop_id = p_barbershop_id
    and p.catalog_verified_at is not null and p.catalog_verified_by is not null and p.catalog_verification_note is not null;
  select count(*) into v_unverified_active from public.shop_products p where p.barbershop_id = p_barbershop_id
    and p.is_active and (p.catalog_verified_at is null or p.catalog_verified_by is null or p.catalog_verification_note is null);
  select count(*) into v_missing_photo from public.shop_products p where p.barbershop_id = p_barbershop_id
    and p.is_active and p.image_url is null;
  select count(*) into v_missing_provenance from public.shop_products p where p.barbershop_id = p_barbershop_id
    and p.is_active and p.image_url is not null and (p.image_alt is null or p.image_source_note is null
      or p.image_source_checked_at is null or p.image_authorized_by is null or p.image_authorized_at is null
      or (p.image_source_url is not null and p.image_source_url !~ '^https://'));
  select count(*) into v_no_variant from public.shop_products p where p.barbershop_id = p_barbershop_id and p.is_active
    and not exists (select 1 from public.shop_product_variants v where v.product_id = p.id
      and v.barbershop_id = p.barbershop_id and v.is_active);
  select count(*) into v_out_of_stock from public.shop_products p join public.shop_product_variants v
    on v.product_id = p.id and v.barbershop_id = p.barbershop_id
    where p.barbershop_id = p_barbershop_id and p.is_active and p.track_stock and v.is_active and v.stock_on_hand <= 0;
  v_result := jsonb_build_object(
    'products_total', v_total, 'products_active', v_active, 'products_verified', v_verified,
    'unverified_active_products', v_unverified_active, 'active_products_missing_photo', v_missing_photo,
    'active_products_missing_provenance', v_missing_provenance, 'active_products_without_variant', v_no_variant,
    'active_tracked_variants_out_of_stock', v_out_of_stock,
    'catalog_ready', v_active > 0 and v_unverified_active = 0 and v_missing_photo = 0
      and v_missing_provenance = 0 and v_no_variant = 0 and v_out_of_stock = 0,
    'shop_enabled', coalesce(v_shop_enabled, false)
  );
  return v_result;
end;
$function$;
revoke all on function public.get_shop_phase7_catalog_readiness(uuid) from public, anon;
grant execute on function public.get_shop_phase7_catalog_readiness(uuid) to authenticated;

revoke update on public.shop_notification_events from authenticated;
drop policy if exists shop_notification_events_manager_mark_read on public.shop_notification_events;

create or replace function public.mark_shop_notification_read(p_barbershop_id uuid,p_notification_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_found boolean;
begin
  if auth.uid() is null or not public.is_member(
    p_barbershop_id, array['owner','manager']::public.app_role[]
  ) then raise exception 'SHOP_NOTIFICATIONS_FORBIDDEN' using errcode = '42501'; end if;
  update public.shop_notification_events n set read_at = clock_timestamp(), read_by = auth.uid()
  where n.id = p_notification_id and n.barbershop_id = p_barbershop_id and n.read_at is null;
  if found then return true; end if;
  select exists(select 1 from public.shop_notification_events n
    where n.id = p_notification_id and n.barbershop_id = p_barbershop_id and n.read_at is not null) into v_found;
  return v_found;
end;
$function$;
revoke all on function public.mark_shop_notification_read(uuid,uuid) from public, anon;
grant execute on function public.mark_shop_notification_read(uuid,uuid) to authenticated;
