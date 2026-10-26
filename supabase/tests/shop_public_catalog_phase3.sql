-- Phase 3 public catalogue contract. All data is fixture-only and rolled back.
begin;
do $shop_public_catalog_phase3$
declare
  v_actor uuid := gen_random_uuid();
  v_shop uuid;
  v_disabled_shop uuid;
  v_other_shop uuid;
  v_category uuid;
  v_hidden_category uuid;
  v_disabled_category uuid;
  v_product uuid;
  v_untracked_product uuid;
  v_draft_product uuid;
  v_hidden_product uuid;
  v_stock_variant uuid;
  v_available_variant uuid;
  v_untracked_variant uuid;
  v_disabled_product uuid;
  v_disabled_variant uuid;
  v_other_product uuid;
  v_barber uuid;
  v_service uuid;
  v_customer uuid;
  v_appointment uuid;
  v_order uuid;
  v_public jsonb;
  v_disabled jsonb;
  v_rejected boolean;
begin
  insert into public.barbershops(slug, name, status)
  values ('phase3-' || left(replace(gen_random_uuid()::text, '-', ''), 12), 'Phase 3 QA', 'active')
  returning id into v_shop;
  insert into public.barbershops(slug, name, status)
  values ('phase3-off-' || left(replace(gen_random_uuid()::text, '-', ''), 12), 'Phase 3 disabled QA', 'active')
  returning id into v_disabled_shop;
  insert into public.barbershops(slug, name, status)
  values ('phase3-other-' || left(replace(gen_random_uuid()::text, '-', ''), 12), 'Phase 3 other tenant QA', 'active')
  returning id into v_other_shop;

  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(v_actor,'authenticated','authenticated','phase3-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
  insert into public.barbershop_members(barbershop_id,user_id,role)
    values(v_shop,v_actor,'owner'),(v_disabled_shop,v_actor,'owner'),(v_other_shop,v_actor,'owner');

  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.barbershops set shop_enabled = true where id in (v_shop, v_other_shop);

  insert into public.shop_product_categories(barbershop_id, name, is_active)
  values (v_shop, 'Bebidas QA', true) returning id into v_category;
  insert into public.shop_product_categories(barbershop_id, name, is_active)
  values (v_shop, 'Oculta QA', false) returning id into v_hidden_category;
  insert into public.shop_product_categories(barbershop_id, name, is_active)
  values (v_disabled_shop, 'Categoria desligada QA', true) returning id into v_disabled_category;

  insert into public.shop_products(barbershop_id, category_id, name, brand, description, order_options, is_active)
  values (v_shop, v_category, 'Água QA', 'Marca QA', 'Água de teste',
          '["Fria","À temperatura ambiente"]'::jsonb, false)
  returning id into v_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, unit_label, price_minor, is_active)
  values (v_shop, v_product, '500 ml esgotada', 'unidade', 5000, true) returning id into v_stock_variant;
  insert into public.shop_product_variants(barbershop_id, product_id, label, unit_label, price_minor, is_active)
  values (v_shop, v_product, '1,5 L disponível', 'unidade', 8500, true) returning id into v_available_variant;
  perform public.record_shop_inventory_movement(v_shop, v_stock_variant, 2, 'opening_balance', 'phase 3 rollback fixture');
  perform public.record_shop_inventory_movement(v_shop, v_available_variant, 5, 'opening_balance', 'phase 3 rollback fixture');

  insert into public.shop_products(barbershop_id, name, track_stock, is_active)
  values (v_shop, 'Produto sem controlo de stock QA', false, false) returning id into v_untracked_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, unit_label, price_minor, stock_on_hand, is_active)
  values (v_shop, v_untracked_product, 'Unidade', 'unidade', 12345, 0, true) returning id into v_untracked_variant;

  insert into public.shop_products(barbershop_id, name, is_active)
  values (v_shop, 'Produto rascunho QA', false) returning id into v_draft_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, price_minor, is_active)
  values (v_shop, v_draft_product, 'Unidade', 100, true);

  insert into public.shop_products(barbershop_id, category_id, name, is_active)
  values (v_shop, v_hidden_category, 'Produto de categoria oculta QA', false) returning id into v_hidden_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, price_minor, is_active)
  values (v_shop, v_hidden_product, 'Unidade', 100, true);

  insert into public.shop_products(barbershop_id, category_id, name, track_stock, is_active)
  values (v_disabled_shop, v_disabled_category, 'Produto activo loja desligada QA', false, false) returning id into v_disabled_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, price_minor, is_active)
  values (v_disabled_shop, v_disabled_product, 'Unidade', 200, true) returning id into v_disabled_variant;

  insert into public.shop_products(barbershop_id, name, track_stock, is_active)
  values (v_other_shop, 'Produto de outro tenant QA', false, false) returning id into v_other_product;
  insert into public.shop_product_variants(barbershop_id, product_id, label, price_minor, is_active)
  values (v_other_shop, v_other_product, 'Unidade', 300, true);

  -- Minimal same-tenant appointment/order fixture required by inventory reservations.
  insert into public.barbers(display_name, barbershop_id)
  values ('Barbeiro Phase 3 QA', v_shop) returning id into v_barber;
  insert into public.services(barbershop_id, name, price_cents, duration_min)
  values (v_shop, 'Serviço Phase 3 QA', 12000, 30) returning id into v_service;
  insert into public.customers(barbershop_id, name, phone)
  values (v_shop, 'Cliente Phase 3 QA', 'phase3-' || left(replace(gen_random_uuid()::text, '-', ''), 12))
  returning id into v_customer;
  insert into public.appointments(barbershop_id, barber_id, service_id, customer_id, starts_at, ends_at, duration_min, price_cents, status)
  values (v_shop, v_barber, v_service, v_customer, now() + interval '90 days',
          now() + interval '90 days 30 minutes', 30, 12000, 'confirmed')
  returning id into v_appointment;
  insert into public.appointment_product_orders(barbershop_id, appointment_id, customer_note)
  values (v_shop, v_appointment, 'Phase 3 rollback reservation fixture')
  returning id into v_order;

  insert into public.inventory_reservations(barbershop_id, order_id, variant_id, qty, status, expires_at)
  values (v_shop, v_order, v_stock_variant, 2, 'reserved', now() + interval '1 hour'),
         (v_shop, v_order, v_available_variant, 2, 'reserved', now() + interval '1 hour');

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  update public.shop_products set image_url='https://example.invalid/phase3-product.jpg',
    image_alt='Phase 3 main product test fixture',image_source_note='Only an isolated database fixture; not a real catalogue asset.' where id=v_product;
  perform public.verify_shop_catalog_product(v_shop,v_product,'Fixture only; public catalogue filters and stock reservations are tested in isolation.');
  update public.shop_products set image_url='https://example.invalid/phase3-untracked.jpg',
    image_alt='Phase 3 untracked test fixture',image_source_note='Only an isolated database fixture; not a real catalogue asset.' where id=v_untracked_product;
  perform public.verify_shop_catalog_product(v_shop,v_untracked_product,'Fixture only; public catalogue filters without stock tracking.');
  update public.shop_products set image_url='https://example.invalid/phase3-disabled.jpg',
    image_alt='Phase 3 disabled tenant test fixture',image_source_note='Only an isolated database fixture; not a real catalogue asset.' where id=v_disabled_product;
  perform public.verify_shop_catalog_product(v_disabled_shop,v_disabled_product,'Fixture only; disabled tenant must not expose active catalogue.');
  update public.shop_products set image_url='https://example.invalid/phase3-other.jpg',
    image_alt='Phase 3 other tenant test fixture',image_source_note='Only an isolated database fixture; not a real catalogue asset.' where id=v_other_product;
  perform public.verify_shop_catalog_product(v_other_shop,v_other_product,'Fixture only; tenant isolation regression contract.');
  update public.shop_products set is_active = true where id in (v_product, v_untracked_product);
  update public.shop_products set is_active = true where id in (v_disabled_product, v_other_product);
  perform set_config('request.jwt.claim.role','service_role',true);

  select public.get_public_shop_catalog((select slug from public.barbershops where id = v_shop))
  into v_public;
  if v_public->>'enabled' is distinct from 'true' then
    raise exception 'FAIL: enabled tenant did not return enabled=true';
  end if;
  if jsonb_array_length(v_public->'categories') <> 1 then
    raise exception 'FAIL: inactive category leaked or active category missing';
  end if;
  if jsonb_array_length(v_public->'products') <> 2 then
    raise exception 'FAIL: inactive product, inactive-category product or wrong-tenant product leaked';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_public->'products') p
    where p->>'name' = 'Água QA' and p->>'brand' = 'Marca QA'
      and p->'order_options' = '["Fria","À temperatura ambiente"]'::jsonb
  ) then raise exception 'FAIL: active product DTO/options missing'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_public->'products') p
    cross join lateral jsonb_array_elements(p->'variants') v
    where p->>'name' = 'Água QA'
      and v->>'label' = '500 ml esgotada'
      and v->'available' = 'false'::jsonb
      and (v->>'price_minor')::bigint = 5000
  ) then raise exception 'FAIL: fully reserved variant not reported unavailable'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_public->'products') p
    cross join lateral jsonb_array_elements(p->'variants') v
    where p->>'name' = 'Água QA'
      and v->>'label' = '1,5 L disponível'
      and v->'available' = 'true'::jsonb
  ) then raise exception 'FAIL: available stock after partial reservation was not reported available'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_public->'products') p
    cross join lateral jsonb_array_elements(p->'variants') v
    where p->>'name' = 'Produto sem controlo de stock QA'
      and v->'available' = 'true'::jsonb
      and (v->>'price_minor')::bigint = 12345
  ) then raise exception 'FAIL: non-stock-tracked product should be available'; end if;
  if v_public::text ~* '(stock_on_hand|low_stock_threshold|reserved_qty|image_source_url|image_source_note|image_authorized_by|customer_id|appointment_id|manage_token)' then
    raise exception 'FAIL: public DTO contains private inventory, image approval or booking data';
  end if;

  select public.get_public_shop_catalog((select slug from public.barbershops where id = v_disabled_shop))
  into v_disabled;
  if v_disabled->>'enabled' is distinct from 'false'
     or jsonb_array_length(v_disabled->'categories') <> 0
     or jsonb_array_length(v_disabled->'products') <> 0 then
    raise exception 'FAIL: disabled tenant leaked catalogue data';
  end if;
  if not has_function_privilege('anon', 'public.get_public_shop_catalog(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_public_shop_catalog(text)', 'EXECUTE') then
    raise exception 'FAIL: public catalogue RPC execute grant missing';
  end if;

  v_rejected := false;
  begin
    perform public.get_public_shop_catalog('phase3-slug-that-does-not-exist');
  exception when raise_exception then
    if position('BARBERSHOP_NOT_FOUND' in sqlerrm) > 0 then v_rejected := true; else raise; end if;
  end;
  if not v_rejected then raise exception 'FAIL: unknown tenant slug was accepted'; end if;
end;
$shop_public_catalog_phase3$;
rollback;
