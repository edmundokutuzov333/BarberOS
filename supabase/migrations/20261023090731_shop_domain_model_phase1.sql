-- BarberOS | Loja da Barbearia | Fase 1: modelo de domínio
-- Forward-only. Esta migration não activa a loja nem altera o motor de marcações.

create schema if not exists private;
alter table public.barbershops add column if not exists shop_enabled boolean not null default false;
comment on column public.barbershops.shop_enabled is
  'Feature flag por barbearia para a Loja da Barbearia. False até aceitação explícita do piloto.';
create index if not exists barbershops_shop_enabled_idx on public.barbershops(id) where shop_enabled;

do $$ begin create type public.shop_product_kind as enum ('consume_here','takeaway','both');
exception when duplicate_object then null; end $$;
do $$ begin create type public.shop_order_status as enum ('received','needs_confirmation','accepted','preparing','ready','partially_delivered','delivered','cancelled','failed');
exception when duplicate_object then null; end $$;
do $$ begin create type public.shop_order_item_status as enum ('requested','accepted','unavailable','preparing','ready','partially_delivered','delivered','cancelled','failed');
exception when duplicate_object then null; end $$;
grant usage on type public.shop_product_kind, public.shop_order_status, public.shop_order_item_status to anon, authenticated, service_role;

create table public.shop_product_categories (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 description text check(description is null or length(description)<=500),
 sort_order integer not null default 0,
 is_active boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,barbershop_id)
);
create unique index shop_product_categories_name_tenant_unique on public.shop_product_categories(barbershop_id,lower(name));
create index shop_product_categories_public_idx on public.shop_product_categories(barbershop_id,sort_order) where is_active;

create table public.shop_products (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 category_id uuid,
 brand text check(brand is null or length(brand)<=120),
 name text not null check(length(btrim(name)) between 1 and 160),
 description text check(description is null or length(description)<=2000),
 image_url text,
 image_alt text check(image_alt is null or length(image_alt)<=250),
 image_source_url text check(image_source_url is null or image_source_url ~ '^https://'),
 image_source_checked_at timestamptz,
 product_kind public.shop_product_kind not null default 'both',
 track_stock boolean not null default true,
 is_active boolean not null default false,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,barbershop_id),
 foreign key(category_id,barbershop_id)
  references public.shop_product_categories(id,barbershop_id) on delete restrict
);
create unique index shop_products_name_tenant_unique on public.shop_products(barbershop_id,lower(name));
create index shop_products_catalog_idx on public.shop_products(barbershop_id,category_id,sort_order) where is_active;

create table public.shop_product_variants (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 product_id uuid not null,
 sku text check(sku is null or length(btrim(sku)) between 1 and 80),
 label text not null check(length(btrim(label)) between 1 and 120),
 attributes jsonb not null default '{}'::jsonb check(jsonb_typeof(attributes)='object'),
 unit_label text not null default 'unidade' check(length(btrim(unit_label)) between 1 and 40),
 price_minor bigint not null check(price_minor>=0),
 stock_on_hand integer not null default 0 check(stock_on_hand>=0),
 low_stock_threshold integer not null default 0 check(low_stock_threshold>=0),
 is_active boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(product_id,barbershop_id) references public.shop_products(id,barbershop_id) on delete cascade,
 unique(id,product_id,barbershop_id),
 unique(id,barbershop_id)
);
create unique index shop_product_variants_sku_tenant_unique on public.shop_product_variants(barbershop_id,lower(sku)) where sku is not null;
create index shop_product_variants_active_idx on public.shop_product_variants(barbershop_id,product_id) where is_active;

alter table public.appointments add constraint appointments_id_barbershop_unique unique(id,barbershop_id);

create table public.appointment_product_orders (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 appointment_id uuid not null unique,
 status public.shop_order_status not null default 'received',
 requested_for timestamptz not null default now(),
 customer_note text check(customer_note is null or length(customer_note)<=2000),
 created_by uuid references auth.users(id) on delete set null,
 accepted_by uuid references auth.users(id) on delete set null,
 ready_by uuid references auth.users(id) on delete set null,
 delivered_by uuid references auth.users(id) on delete set null,
 cancelled_by uuid references auth.users(id) on delete set null,
 accepted_at timestamptz, ready_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
 cancellation_reason text check(cancellation_reason is null or length(cancellation_reason)<=500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,barbershop_id),
 foreign key(appointment_id,barbershop_id) references public.appointments(id,barbershop_id) on delete restrict
);
create index appointment_product_orders_queue_idx on public.appointment_product_orders(barbershop_id,requested_for,status);
create index appointment_product_orders_created_idx on public.appointment_product_orders(barbershop_id,created_at desc);

create table public.appointment_product_order_items (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 order_id uuid not null, product_id uuid not null, variant_id uuid not null,
 product_name_snapshot text not null check(length(btrim(product_name_snapshot)) between 1 and 160),
 variant_snapshot text not null check(length(btrim(variant_snapshot)) between 1 and 160),
 unit_price_snapshot bigint not null check(unit_price_snapshot>=0),
 qty integer not null check(qty between 1 and 1000),
 options jsonb not null default '{}'::jsonb check(jsonb_typeof(options)='object'),
 line_total_snapshot bigint not null check(line_total_snapshot>=0),
 status public.shop_order_item_status not null default 'requested',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(line_total_snapshot=unit_price_snapshot*qty),
 unique(id,barbershop_id),
 foreign key(order_id,barbershop_id) references public.appointment_product_orders(id,barbershop_id) on delete restrict,
 foreign key(product_id,barbershop_id) references public.shop_products(id,barbershop_id) on delete restrict,
 foreign key(variant_id,product_id,barbershop_id) references public.shop_product_variants(id,product_id,barbershop_id) on delete restrict
);
create index appointment_product_order_items_order_idx on public.appointment_product_order_items(order_id,created_at);
create index appointment_product_order_items_variant_idx on public.appointment_product_order_items(barbershop_id,variant_id,status);

create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 variant_id uuid not null, order_line_id uuid,
 delta_qty integer not null check(delta_qty<>0),
 reason text not null check(reason in ('opening_balance','purchase','sale','adjustment','waste','return')),
 actor_id uuid references auth.users(id) on delete set null,
 note text check(note is null or length(note)<=500),
 created_at timestamptz not null default now(),
 foreign key(variant_id,barbershop_id) references public.shop_product_variants(id,barbershop_id) on delete restrict,
 foreign key(order_line_id,barbershop_id) references public.appointment_product_order_items(id,barbershop_id) on delete restrict,
 check((reason in ('opening_balance','purchase','return') and delta_qty>0)
    or (reason in ('sale','waste') and delta_qty<0) or reason='adjustment')
);
create index inventory_movements_variant_history_idx on public.inventory_movements(barbershop_id,variant_id,created_at desc);
create index inventory_movements_order_line_idx on public.inventory_movements(order_line_id) where order_line_id is not null;

create table public.inventory_reservations (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 order_id uuid not null, variant_id uuid not null,
 qty integer not null check(qty between 1 and 1000),
 status text not null default 'reserved' check(status in ('reserved','released','consumed','expired')),
 expires_at timestamptz, released_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(order_id,barbershop_id) references public.appointment_product_orders(id,barbershop_id) on delete restrict,
 foreign key(variant_id,barbershop_id) references public.shop_product_variants(id,barbershop_id) on delete restrict
);
create index inventory_reservations_active_variant_idx on public.inventory_reservations(barbershop_id,variant_id,expires_at) where status='reserved';
create index inventory_reservations_order_idx on public.inventory_reservations(order_id,status);

create or replace function private.shop_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at := now();
 if tg_op='INSERT' then
  new.created_by := coalesce(new.created_by,auth.uid());
 end if;
 new.updated_by := coalesce(auth.uid(),new.updated_by);
 return new;
end; $$;

create or replace function private.shop_order_derive_requested_for()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_starts_at timestamptz;
begin
 select a.starts_at into v_starts_at from public.appointments a
 where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id;
 if not found then raise exception 'SHOP_ORDER_APPOINTMENT_TENANT_MISMATCH'; end if;
 new.requested_for:=v_starts_at;
 return new;
end; $$;

create or replace function private.shop_order_status_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
 new.updated_at:=now();
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if not (
   (old.status='received' and new.status in ('needs_confirmation','accepted','cancelled','failed'))
   or (old.status='needs_confirmation' and new.status in ('received','accepted','cancelled','failed'))
   or (old.status='accepted' and new.status in ('needs_confirmation','preparing','cancelled','failed'))
   or (old.status='preparing' and new.status in ('ready','partially_delivered','cancelled','failed'))
   or (old.status='ready' and new.status in ('partially_delivered','delivered','cancelled','failed'))
   or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
  ) then
   raise exception 'INVALID_SHOP_ORDER_TRANSITION: % -> %',old.status,new.status using errcode='check_violation';
  end if;
  if new.status='accepted' then new.accepted_at:=coalesce(new.accepted_at,now()); new.accepted_by:=coalesce(new.accepted_by,v_actor);
  elsif new.status='ready' then new.ready_at:=coalesce(new.ready_at,now()); new.ready_by:=coalesce(new.ready_by,v_actor);
  elsif new.status='delivered' then new.delivered_at:=coalesce(new.delivered_at,now()); new.delivered_by:=coalesce(new.delivered_by,v_actor);
  elsif new.status='cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,now()); new.cancelled_by:=coalesce(new.cancelled_by,v_actor);
  end if;
 end if;
 return new;
end; $$;

create or replace function private.shop_order_item_status_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.updated_at:=now();
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if not (
   (old.status='requested' and new.status in ('accepted','unavailable','cancelled'))
   or (old.status='accepted' and new.status in ('preparing','ready','unavailable','cancelled','failed'))
   or (old.status='preparing' and new.status in ('ready','partially_delivered','cancelled','failed'))
   or (old.status='ready' and new.status in ('partially_delivered','delivered','cancelled','failed'))
   or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
  ) then
   raise exception 'INVALID_SHOP_ORDER_ITEM_TRANSITION: % -> %',old.status,new.status using errcode='check_violation';
  end if;
 end if;
 return new;
end; $$;

create or replace function private.shop_inventory_movement_apply()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_current integer; v_reserved integer;
begin
 select v.stock_on_hand into v_current from public.shop_product_variants v
 where v.id=new.variant_id and v.barbershop_id=new.barbershop_id for update;
 if not found then raise exception 'INVENTORY_VARIANT_TENANT_MISMATCH'; end if;
 select coalesce(sum(r.qty),0)::integer into v_reserved from public.inventory_reservations r
 where r.variant_id=new.variant_id and r.barbershop_id=new.barbershop_id
 and r.status='reserved' and (r.expires_at is null or r.expires_at>now());
 if v_current+new.delta_qty<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
 if v_current+new.delta_qty<v_reserved then raise exception 'STOCK_RESERVED'; end if;
 update public.shop_product_variants set stock_on_hand=stock_on_hand+new.delta_qty,updated_at=now()
 where id=new.variant_id and barbershop_id=new.barbershop_id;
 return new;
end; $$;

create or replace function private.shop_reservation_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_stock integer; v_reserved integer;
begin
 select v.stock_on_hand into v_stock from public.shop_product_variants v
 where v.id=new.variant_id and v.barbershop_id=new.barbershop_id for update;
 if not found then raise exception 'RESERVATION_VARIANT_TENANT_MISMATCH'; end if;
 if tg_op='INSERT' and new.status<>'reserved' then raise exception 'INVALID_INITIAL_RESERVATION_STATUS'; end if;
 if tg_op='UPDATE' then
  if new.order_id<>old.order_id or new.variant_id<>old.variant_id or new.barbershop_id<>old.barbershop_id or new.qty<>old.qty then
   raise exception 'RESERVATION_IDENTITY_IMMUTABLE';
  end if;
  if new.status is distinct from old.status and not (old.status='reserved' and new.status in ('released','consumed','expired')) then
   raise exception 'INVALID_RESERVATION_TRANSITION: % -> %',old.status,new.status using errcode='check_violation';
  end if;
  if old.status='reserved' and new.status in ('released','expired') then new.released_at:=coalesce(new.released_at,now()); end if;
 end if;
 if new.status='reserved' then
  select coalesce(sum(r.qty),0)::integer into v_reserved from public.inventory_reservations r
  where r.variant_id=new.variant_id and r.barbershop_id=new.barbershop_id
   and r.status='reserved' and (r.expires_at is null or r.expires_at>now())
   and (tg_op='INSERT' or r.id<>new.id);
  if v_reserved+new.qty>v_stock then raise exception 'INSUFFICIENT_AVAILABLE_STOCK'; end if;
 end if;
 new.updated_at:=now();
 return new;
end; $$;

create trigger shop_product_categories_touch_updated_at before insert or update on public.shop_product_categories
for each row execute function private.shop_touch_updated_at();
create trigger shop_products_touch_updated_at before insert or update on public.shop_products
for each row execute function private.shop_touch_updated_at();
create trigger shop_product_variants_touch_updated_at before insert or update on public.shop_product_variants
for each row execute function private.shop_touch_updated_at();
create trigger appointment_product_orders_derive_requested_for before insert or update of appointment_id on public.appointment_product_orders
for each row execute function private.shop_order_derive_requested_for();
create trigger appointment_product_orders_status_guard before update on public.appointment_product_orders
for each row execute function private.shop_order_status_guard();
create trigger appointment_product_order_items_status_guard before insert or update on public.appointment_product_order_items
for each row execute function private.shop_order_item_status_guard();
create trigger inventory_movements_apply_stock before insert on public.inventory_movements
for each row execute function private.shop_inventory_movement_apply();
create trigger inventory_reservations_guard before insert or update on public.inventory_reservations
for each row execute function private.shop_reservation_guard();

create or replace function public.record_shop_inventory_movement(
 p_barbershop_id uuid,p_variant_id uuid,p_delta_qty integer,p_reason text,p_note text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid:=auth.uid();
begin
 if p_barbershop_id is null or p_variant_id is null or p_delta_qty is null or p_delta_qty=0 then raise exception 'INVALID_INVENTORY_MOVEMENT'; end if;
 if p_reason not in ('opening_balance','purchase','sale','adjustment','waste','return') then raise exception 'INVALID_INVENTORY_REASON'; end if;
 if (p_reason in ('opening_balance','purchase','return') and p_delta_qty<1)
   or (p_reason in ('sale','waste') and p_delta_qty>-1) then raise exception 'INVALID_INVENTORY_DELTA'; end if;
 if p_note is not null and length(p_note)>500 then raise exception 'INVALID_INVENTORY_NOTE'; end if;
 if coalesce(auth.role(),'')<>'service_role' then
  if v_actor is null or not (public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()) then
   raise exception 'NOT_AUTHORIZED';
  end if;
 end if;
 if not exists(select 1 from public.shop_product_variants v where v.id=p_variant_id and v.barbershop_id=p_barbershop_id) then
  raise exception 'INVENTORY_VARIANT_TENANT_MISMATCH';
 end if;
 if p_reason='opening_balance' and (
   exists(select 1 from public.shop_product_variants v where v.id=p_variant_id and v.barbershop_id=p_barbershop_id and v.stock_on_hand<>0)
   or exists(select 1 from public.inventory_movements m where m.variant_id=p_variant_id and m.barbershop_id=p_barbershop_id)
 ) then raise exception 'OPENING_BALANCE_ALREADY_RECORDED'; end if;
 insert into public.inventory_movements(barbershop_id,variant_id,delta_qty,reason,actor_id,note)
 values(p_barbershop_id,p_variant_id,p_delta_qty,p_reason,v_actor,nullif(btrim(p_note),''))
 returning id into v_id;
 return v_id;
end; $$;

revoke all on function public.record_shop_inventory_movement(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.record_shop_inventory_movement(uuid,uuid,integer,text,text) to authenticated,service_role;
revoke all on function private.shop_touch_updated_at() from public,anon,authenticated;
revoke all on function private.shop_order_derive_requested_for() from public,anon,authenticated;
revoke all on function private.shop_order_status_guard() from public,anon,authenticated;
revoke all on function private.shop_order_item_status_guard() from public,anon,authenticated;
revoke all on function private.shop_inventory_movement_apply() from public,anon,authenticated;
revoke all on function private.shop_reservation_guard() from public,anon,authenticated;

alter table public.shop_product_categories enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_product_variants enable row level security;
alter table public.appointment_product_orders enable row level security;
alter table public.appointment_product_order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_reservations enable row level security;

revoke all on public.shop_product_categories,public.shop_products,public.shop_product_variants,
 public.appointment_product_orders,public.appointment_product_order_items,public.inventory_movements,
 public.inventory_reservations from public,anon,authenticated;
grant select on public.shop_product_categories,public.shop_products,public.shop_product_variants to anon,authenticated;

grant insert,delete on public.shop_product_categories to authenticated;
grant update(name,description,sort_order,is_active) on public.shop_product_categories to authenticated;
grant insert,delete on public.shop_products to authenticated;
grant update(category_id,brand,name,description,image_url,image_alt,image_source_url,image_source_checked_at,product_kind,track_stock,is_active,sort_order)
 on public.shop_products to authenticated;
grant insert,delete on public.shop_product_variants to authenticated;
grant update(sku,label,attributes,unit_label,price_minor,low_stock_threshold,is_active)
 on public.shop_product_variants to authenticated;
grant select on public.appointment_product_orders,public.appointment_product_order_items,public.inventory_movements,public.inventory_reservations to authenticated;
grant all on public.shop_product_categories,public.shop_products,public.shop_product_variants,
 public.appointment_product_orders,public.appointment_product_order_items,public.inventory_movements,
 public.inventory_reservations to service_role;

create policy shop_product_categories_public_read on public.shop_product_categories for select using (
 is_active and exists(select 1 from public.barbershops b where b.id=shop_product_categories.barbershop_id and b.status in ('trial','active') and b.shop_enabled=true)
);
create policy shop_product_categories_member_read on public.shop_product_categories for select using (
 public.is_member(barbershop_id) or public.is_platform_admin()
);
create policy shop_product_categories_manage on public.shop_product_categories for all
 using(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin())
 with check(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin());

create policy shop_products_public_read on public.shop_products for select using (
 is_active and exists(select 1 from public.barbershops b where b.id=shop_products.barbershop_id and b.status in ('trial','active') and b.shop_enabled=true)
 and (category_id is null or exists(select 1 from public.shop_product_categories c where c.id=shop_products.category_id and c.barbershop_id=shop_products.barbershop_id and c.is_active=true))
);
create policy shop_products_member_read on public.shop_products for select using (
 public.is_member(barbershop_id) or public.is_platform_admin()
);
create policy shop_products_manage on public.shop_products for all
 using(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin())
 with check(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin());

create policy shop_product_variants_public_read on public.shop_product_variants for select using (
 is_active and exists(
  select 1 from public.shop_products p join public.barbershops b on b.id=p.barbershop_id
  where p.id=shop_product_variants.product_id and p.barbershop_id=shop_product_variants.barbershop_id
  and p.is_active=true and b.status in ('trial','active') and b.shop_enabled=true
 )
);
create policy shop_product_variants_member_read on public.shop_product_variants for select using (
 public.is_member(barbershop_id) or public.is_platform_admin()
);
create policy shop_product_variants_manage on public.shop_product_variants for all
 using(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin())
 with check(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin());

create policy appointment_product_orders_member_read on public.appointment_product_orders for select using (
 public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
);
create policy appointment_product_order_items_member_read on public.appointment_product_order_items for select using (
 exists(select 1 from public.appointment_product_orders o
  where o.id=appointment_product_order_items.order_id and o.barbershop_id=appointment_product_order_items.barbershop_id)
 and (public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin())
);
create policy inventory_movements_manager_read on public.inventory_movements for select using (
 public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
);
create policy inventory_reservations_manager_read on public.inventory_reservations for select using (
 public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
);

comment on table public.shop_product_categories is 'Categorias do catálogo por barbearia; inactivas por defeito.';
comment on table public.shop_products is 'Produtos da Loja da Barbearia. A exposição pública exige shop_enabled e is_active.';
comment on table public.shop_product_variants is 'Variantes com preço em unidade menor de MT; stock é controlado pelo ledger de movimentos.';
comment on table public.appointment_product_orders is 'Pré-encomenda ligada a uma marcação; não representa venda paga nem entrega concluída.';
comment on table public.appointment_product_order_items is 'Linhas de pedido com snapshots de preço, produto, variante e quantidade.';
comment on table public.inventory_movements is 'Ledger do inventário; o stock é actualizado atomicamente por movimento.';
comment on table public.inventory_reservations is 'Reservas por pedido; reservas activas não podem exceder stock físico.';
