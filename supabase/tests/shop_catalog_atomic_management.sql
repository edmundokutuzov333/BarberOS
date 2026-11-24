begin;
do $test$
declare
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); barber uuid:=gen_random_uuid();
 shop uuid:=gen_random_uuid(); category uuid:=gen_random_uuid(); product uuid:=gen_random_uuid();
 payload jsonb; result jsonb; saved_at timestamptz; edited_at timestamptz; audit_count bigint; rejected boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(actor,actor||'@example.invalid','{}'),(outsider,outsider||'@example.invalid','{}'),(barber,barber||'@example.invalid','{}');
 insert into public.barbershops(id,slug,name,status) values(shop,'catalog-atomic-'||shop,'Atomic catalog fixture','trial');
 insert into public.barbershop_members(barbershop_id,user_id,role) values(shop,actor,'owner'),(shop,barber,'barber');
 insert into public.shop_product_categories(id,barbershop_id,name,is_active) values(category,shop,'Água',true);
 payload:=jsonb_build_object('name',' Água da Namaacha ','brand','Namaacha','category_id',upper(category::text),'description','Água mineral',
 'product_kind','both','track_stock',false,'image_url','https://example.invalid/bottle.jpg','image_alt','Garrafa de água',
 'image_source_url','https://example.invalid/source','image_source_note','Fixture own photo; transactional test only.','order_options','["Fresca","Natural"]'::jsonb);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 result:=public.save_shop_catalog_product(shop,product,payload);
 saved_at:=(result->>'updated_at')::timestamptz;
 if result->>'name'<>'Água da Namaacha' or result->>'image_authorized_by'<>actor::text or (result->>'is_active')::boolean then raise exception 'FAIL atomic image and identity'; end if;
 select count(*) into audit_count from public.shop_catalog_audit_events where entity_id=product;
 result:=public.save_shop_catalog_product(shop,product,payload);
 if (result->>'updated_at')::timestamptz<>saved_at or (select count(*) from public.shop_catalog_audit_events where entity_id=product)<>audit_count then raise exception 'FAIL retry changed audit or version'; end if;
 result:=public.save_shop_catalog_product(shop,product,payload||'{"name":"Nova identidade"}',saved_at);
 edited_at:=(result->>'updated_at')::timestamptz;
 if edited_at<=saved_at then raise exception 'FAIL row version did not advance within transaction'; end if;
 rejected:=false;
 begin perform public.save_shop_catalog_product(shop,product,payload||'{"name":"Edição concorrente"}',saved_at);
 exception when serialization_failure then rejected:=sqlerrm='SHOP_CATALOG_CONFLICT'; end;
 if not rejected then raise exception 'FAIL stale save'; end if;
 rejected:=false;
 begin perform public.save_shop_catalog_product(shop,gen_random_uuid(),payload||'{"is_active":true}');
 exception when raise_exception then rejected:=sqlerrm='SHOP_CATALOG_INVALID_INPUT'; end;
 if not rejected then raise exception 'FAIL server field injection'; end if;
 rejected:=false;
 begin perform public.save_shop_catalog_product(shop,gen_random_uuid(),payload||'{"order_options":["Fria"," fria "]}');
 exception when raise_exception then rejected:=sqlerrm='SHOP_PRODUCT_ORDER_OPTIONS_INVALID'; end;
 if not rejected then raise exception 'FAIL duplicate options'; end if;
 rejected:=false;
 begin perform public.publish_shop_catalog_product(shop,product,true,edited_at,'Verified product fixture, no real stock claim.');
 exception when raise_exception then rejected:=sqlerrm='SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT'; end;
 if not rejected or exists(select 1 from public.shop_products where id=product and catalog_verified_at is not null) then raise exception 'FAIL incomplete publication rollback'; end if;
 insert into public.shop_product_variants(barbershop_id,product_id,label,unit_label,price_minor,is_active) values(shop,product,'500 ml','unidade',2500,true);
 select updated_at into edited_at from public.shop_products where id=product;
 rejected:=false;
 begin perform public.publish_shop_catalog_product(shop,product,true,saved_at,'Verified product fixture, no real stock claim.');
 exception when serialization_failure then rejected:=sqlerrm='SHOP_CATALOG_CONFLICT'; end;
 if not rejected then raise exception 'FAIL stale publication'; end if;
 result:=public.publish_shop_catalog_product(shop,product,true,edited_at,'Verified product fixture, no real stock claim.');
 if not (result->>'is_active')::boolean or result->>'catalog_verified_by'<>actor::text then raise exception 'FAIL atomic verify/publish'; end if;
 select count(*) into audit_count from public.shop_catalog_audit_events where entity_id=product;
 result:=public.publish_shop_catalog_product(shop,product,true,edited_at,'Retry');
 if (select count(*) from public.shop_catalog_audit_events where entity_id=product)<>audit_count then raise exception 'FAIL publish retry duplicated audit'; end if;
 foreach outsider in array array[outsider,barber] loop
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  rejected:=false;
  begin perform public.save_shop_catalog_product(shop,product,payload);
  exception when insufficient_privilege then rejected:=sqlerrm='SHOP_CATALOG_FORBIDDEN'; end;
  if not rejected then raise exception 'FAIL tenant or role boundary'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;
 begin perform public.publish_shop_catalog_product(shop,product,false,edited_at);
 exception when insufficient_privilege then rejected:=sqlerrm='SHOP_CATALOG_FORBIDDEN'; end;
 if not rejected then raise exception 'FAIL unauthenticated publish'; end if;
 if has_function_privilege('anon','public.save_shop_catalog_product(uuid,uuid,jsonb,timestamptz)','execute') then raise exception 'FAIL anon grant'; end if;
 raise notice 'PASS atomic catalog: photo/create, canonical retry, one audit, monotonic version, stale save/publish, server field injection, options, publish rollback, verify/publish, tenant/role/anonymous boundaries.';
end;
$test$;
rollback;
