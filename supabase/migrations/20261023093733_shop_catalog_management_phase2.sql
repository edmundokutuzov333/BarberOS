-- BarberOS | Loja da Barbearia | Fase 2: catálogo de gestão, proveniência e histórico.
-- A feature continua desligada para todos os tenants. Esta migration não altera o motor de marcações.

alter table public.shop_products
  add column if not exists image_source_note text
    check (image_source_note is null or length(btrim(image_source_note)) between 1 and 500),
  add column if not exists image_authorized_by uuid references auth.users(id) on delete set null,
  add column if not exists image_authorized_at timestamptz;

create table if not exists public.shop_catalog_audit_events (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  entity_type text not null check (entity_type in ('category','product','variant')),
  entity_id uuid not null,
  action text not null check (action in ('created','updated')),
  actor_id uuid references auth.users(id) on delete set null,
  before_state jsonb,
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists shop_catalog_audit_tenant_created_idx
  on public.shop_catalog_audit_events (barbershop_id, created_at desc);
create index if not exists shop_catalog_audit_entity_created_idx
  on public.shop_catalog_audit_events (barbershop_id, entity_type, entity_id, created_at desc);
create index if not exists shop_catalog_audit_actor_fk_idx
  on public.shop_catalog_audit_events (actor_id);

alter table public.shop_catalog_audit_events enable row level security;
revoke all on public.shop_catalog_audit_events from public, anon, authenticated;
grant select on public.shop_catalog_audit_events to authenticated;
grant all on public.shop_catalog_audit_events to service_role;

create policy shop_catalog_audit_manager_read
on public.shop_catalog_audit_events for select
using (
  public.is_member(barbershop_id, array['owner','manager']::public.app_role[])
  or public.is_platform_admin()
);

-- Source/permission fields are stamped by PostgreSQL. Browser clients cannot claim
-- another actor or forge the date when an image was checked.
revoke insert (image_source_checked_at, image_authorized_by, image_authorized_at)
  on public.shop_products from authenticated;
revoke update (image_source_checked_at, image_authorized_by, image_authorized_at)
  on public.shop_products from authenticated;
grant insert (image_source_note) on public.shop_products to authenticated;
grant update (image_source_note) on public.shop_products to authenticated;

create or replace function private.shop_product_image_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.image_url is not distinct from old.image_url
    and new.image_alt is not distinct from old.image_alt
    and new.image_source_url is not distinct from old.image_source_url
    and new.image_source_note is not distinct from old.image_source_note then
    return new;
  end if;

  new.image_source_url := nullif(btrim(new.image_source_url), '');
  if nullif(btrim(new.image_url), '') is null then
    new.image_url := null;
    new.image_alt := nullif(btrim(new.image_alt), '');
    new.image_source_url := null;
    new.image_source_note := null;
    new.image_source_checked_at := null;
    new.image_authorized_by := null;
    new.image_authorized_at := null;
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'IMAGE_APPROVAL_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(new.image_alt), '') is null
    or nullif(btrim(new.image_source_note), '') is null then
    raise exception 'IMAGE_METADATA_REQUIRED';
  end if;
  if new.image_source_url is not null and new.image_source_url !~ '^https://' then
    raise exception 'IMAGE_SOURCE_URL_INVALID';
  end if;

  new.image_alt := btrim(new.image_alt);
  new.image_source_note := btrim(new.image_source_note);
  new.image_source_checked_at := now();
  new.image_authorized_by := auth.uid();
  new.image_authorized_at := now();
  return new;
end;
$$;

create or replace function private.shop_catalog_audit_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_before jsonb;
  v_after jsonb;
begin
  v_after := to_jsonb(new);
  v_shop_id := (v_after ->> 'barbershop_id')::uuid;
  v_entity_id := (v_after ->> 'id')::uuid;
  v_entity_type := case tg_table_name
    when 'shop_product_categories' then 'category'
    when 'shop_products' then 'product'
    when 'shop_product_variants' then 'variant'
    else null
  end;
  if v_entity_type is null then
    raise exception 'SHOP_AUDIT_ENTITY_UNSUPPORTED';
  end if;

  if tg_op = 'INSERT' then
    insert into public.shop_catalog_audit_events
      (barbershop_id, entity_type, entity_id, action, actor_id, before_state, after_state)
    values
      (v_shop_id, v_entity_type, v_entity_id, 'created', auth.uid(), null, v_after);
  else
    v_before := to_jsonb(old);
    if v_before is distinct from v_after then
      insert into public.shop_catalog_audit_events
        (barbershop_id, entity_type, entity_id, action, actor_id, before_state, after_state)
      values
        (v_shop_id, v_entity_type, v_entity_id, 'updated', auth.uid(), v_before, v_after);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.shop_product_image_approval_guard() from public, anon, authenticated;
revoke all on function private.shop_catalog_audit_write() from public, anon, authenticated;

drop trigger if exists shop_product_image_approval_guard on public.shop_products;
create trigger shop_product_image_approval_guard
before insert or update of image_url, image_alt, image_source_url, image_source_note
on public.shop_products
for each row execute function private.shop_product_image_approval_guard();

drop trigger if exists shop_z_catalog_audit_history on public.shop_product_categories;
create trigger shop_z_catalog_audit_history
after insert or update on public.shop_product_categories
for each row execute function private.shop_catalog_audit_write();

drop trigger if exists shop_z_catalog_audit_history on public.shop_products;
create trigger shop_z_catalog_audit_history
after insert or update on public.shop_products
for each row execute function private.shop_catalog_audit_write();

drop trigger if exists shop_z_catalog_audit_history on public.shop_product_variants;
create trigger shop_z_catalog_audit_history
after insert or update on public.shop_product_variants
for each row execute function private.shop_catalog_audit_write();

-- Public catalogue read is column-limited: no stock balance, audit/provenance,
-- internal SKU, actor IDs or low-stock thresholds are exposed to browser-anon.
revoke select on public.shop_product_categories, public.shop_products, public.shop_product_variants from anon;
grant select (id, barbershop_id, name, description, sort_order)
  on public.shop_product_categories to anon;
grant select (id, barbershop_id, category_id, brand, name, description, image_url, image_alt, product_kind, sort_order)
  on public.shop_products to anon;
grant select (id, barbershop_id, product_id, label, attributes, unit_label, price_minor, is_active)
  on public.shop_product_variants to anon;

-- Do not expose variants when their parent category is inactive.
drop policy if exists shop_product_variants_public_read on public.shop_product_variants;
create policy shop_product_variants_public_read
on public.shop_product_variants for select
using (
  is_active and exists (
    select 1
    from public.shop_products p
    join public.barbershops b on b.id = p.barbershop_id
    where p.id = shop_product_variants.product_id
      and p.barbershop_id = shop_product_variants.barbershop_id
      and p.is_active = true
      and b.status in ('trial','active')
      and b.shop_enabled = true
      and (
        p.category_id is null
        or exists (
          select 1 from public.shop_product_categories c
          where c.id = p.category_id
            and c.barbershop_id = p.barbershop_id
            and c.is_active = true
        )
      )
  )
);

comment on table public.shop_catalog_audit_events is
  'Histórico append-only de criação/edição de categorias, produtos e variantes, incluindo alterações de preço, publicação, proveniência de imagem e saldo provocado por movimentos.';
comment on column public.shop_products.image_source_note is
  'Origem e confirmação de permissão de uso da imagem; exigida quando image_url está preenchido.';
comment on column public.shop_products.image_authorized_by is
  'Utilizador autenticado que confirmou a origem/permissão de uso da imagem.';
