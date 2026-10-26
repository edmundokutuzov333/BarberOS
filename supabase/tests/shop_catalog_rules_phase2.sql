-- Phase 2 rules: preference validation and safe duplication. Roll back all fixtures.
begin;
do $catalog_rules_phase2$
declare
 v_actor uuid := gen_random_uuid();
 v_shop uuid; v_other uuid; v_cat uuid; v_product uuid; v_variant uuid; v_copy uuid; v_copy_variant uuid; v_rejected boolean;
begin
 insert into public.barbershops(slug,name,status) values('phase2r-'||left(replace(gen_random_uuid()::text,'-',''),12),'Phase 2 Rules QA','active') returning id into v_shop;
 insert into public.barbershops(slug,name,status) values('phase2r-'||left(replace(gen_random_uuid()::text,'-',''),12),'Phase 2 Other QA','active') returning id into v_other;
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','phase2r-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.shop_product_categories(barbershop_id,name,is_active) values(v_shop,'Categoria',true) returning id into v_cat;
 insert into public.shop_products(barbershop_id,category_id,name,order_options,is_active)
 values(v_shop,v_cat,'Produto QA','["Sem açúcar","Com gelo"]'::jsonb,false) returning id into v_product;
 v_rejected:=false;
 begin insert into public.shop_products(barbershop_id,name,order_options) values(v_shop,'Opções inválidas','{"not":"array"}'::jsonb);
 exception when check_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: invalid order options accepted'; end if;
 v_rejected:=false;
 begin insert into public.shop_products(barbershop_id,name,order_options) values(v_shop,'Demasiadas opções',jsonb_build_array('1','2','3','4','5','6','7','8','9','10','11'));
 exception when check_violation then v_rejected:=true; end;
 if not v_rejected then raise exception 'FAIL: more than ten options accepted'; end if;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active)
 values(v_shop,v_product,'500 ml',5000,true) returning id into v_variant;
 perform public.record_shop_inventory_movement(v_shop,v_variant,4,'opening_balance','fixture');
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 update public.shop_products set image_url='https://example.invalid/phase2-rules-product.jpg',
   image_alt='Phase 2 rules isolated test fixture',image_source_note='Only an isolated database fixture; not a real catalogue asset.' where id=v_product;
 perform public.verify_shop_catalog_product(v_shop,v_product,'Fixture only; catalogue rules and stock duplication are tested in isolation.');
 update public.shop_products set is_active=true where id=v_product;
 perform set_config('request.jwt.claim.role','service_role',true);
 v_copy:=public.duplicate_shop_product(v_shop,v_product);
 if not exists(select 1 from public.shop_products where id=v_copy and not is_active and order_options='["Sem açúcar","Com gelo"]'::jsonb) then raise exception 'FAIL: duplicate product state/options incorrect'; end if;
 select id into v_copy_variant from public.shop_product_variants where product_id=v_copy and barbershop_id=v_shop;
 if v_copy_variant is null then raise exception 'FAIL: variant was not duplicated'; end if;
 if not exists(select 1 from public.shop_product_variants where id=v_copy_variant and not is_active and stock_on_hand=0 and sku is null and price_minor=5000) then raise exception 'FAIL: duplicate variant is not safe draft'; end if;
 v_rejected:=false;
 begin perform public.duplicate_shop_product(v_other,v_product);
 exception when raise_exception then if position('SHOP_PRODUCT_NOT_FOUND' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: cross-tenant duplicate accepted'; end if;
 if (select stock_on_hand from public.shop_product_variants where id=v_variant)<>4 then raise exception 'FAIL: source stock changed during duplication'; end if;
 if not has_function_privilege('authenticated','private.shop_order_options_valid(jsonb)','EXECUTE') then raise exception 'FAIL: catalogue editor cannot execute order options validator'; end if;
end;
$catalog_rules_phase2$;
rollback;