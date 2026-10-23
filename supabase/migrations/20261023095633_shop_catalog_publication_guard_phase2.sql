-- Phase 2 catalogue publication guard and read-only audit access.
create or replace function private.shop_product_publication_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active and (tg_op = 'INSERT' or old.is_active is distinct from new.is_active
    or old.name is distinct from new.name or old.category_id is distinct from new.category_id) then
    if new.category_id is not null and not exists (
      select 1 from public.shop_product_categories c
      where c.id = new.category_id and c.barbershop_id = new.barbershop_id and c.is_active
    ) then
      raise exception 'SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED';
    end if;
    if not exists (
      select 1 from public.shop_product_variants v
      where v.product_id = new.id and v.barbershop_id = new.barbershop_id and v.is_active
    ) then
      raise exception 'SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shop_product_publication_guard on public.shop_products;
create trigger shop_product_publication_guard
before insert or update of is_active, name, category_id on public.shop_products
for each row execute function private.shop_product_publication_guard();

revoke all on function private.shop_product_publication_guard() from public, anon, authenticated;
grant select on public.shop_catalog_audit_events to authenticated;
