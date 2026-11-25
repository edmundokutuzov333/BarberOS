begin;
do $test$
declare actor uuid:=gen_random_uuid(); sh uuid; pr uuid:=gen_random_uuid(); vr uuid; sl text:='presentation-qa-'||replace(gen_random_uuid()::text,'-',''); payload jsonb; g jsonb; saved jsonb; catalogue jsonb; rejected boolean; version timestamptz;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated',actor::text||'@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
 insert into public.barbershops(slug,name,status) values(sl,'Presentation QA','active') returning id into sh;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(sh,actor,'owner');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 payload:=jsonb_build_object('name','Gallery QA','brand',null,'category_id',null,'description','A detailed product','product_kind','takeaway','track_stock',false,'image_url','https://example.invalid/main.jpg','image_alt','Main image','image_source_url',null,'image_source_note','Own image, authorised for the fixture','order_options','[]'::jsonb);
 g:='[{"url":"https://example.invalid/second.jpg","alt":"Second view","source_note":"Internal rights record"}]'::jsonb;
 saved:=public.save_shop_catalog_product_presentation(sh,pr,payload,g,true,null);
 if saved->'gallery'<>g or not (saved->>'is_featured')::boolean then raise exception 'FAIL gallery persistence';end if;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active) values(sh,pr,'Unit',1000,true) returning id into vr;
 perform public.verify_shop_catalog_product(sh,pr,'Fixture checked: identity, images, price and availability.');
 update public.shop_products set is_active=true where id=pr;
 catalogue:=public.get_public_shop_catalog_v2(sl);
 if not exists(select 1 from jsonb_array_elements(catalogue->'products') e where e->>'id'=pr::text and (e->>'is_featured')::boolean and e->'gallery'->0->>'alt'='Second view' and not(e->'gallery'->0?'source_note')) then raise exception 'FAIL public projection';end if;
 if catalogue::text like '%Internal rights record%' then raise exception 'FAIL source note exposed';end if;
 if (public.get_public_shop_catalog(sl)->'products'->0) ? 'gallery' then raise exception 'FAIL legacy public contract';end if;
 select updated_at into version from public.shop_products where id=pr;
 rejected:=false;
 begin perform public.save_shop_catalog_product_presentation(sh,pr,payload,'[{"url":"javascript:bad","alt":"x","source_note":"y"}]'::jsonb,true,version);exception when raise_exception then if sqlerrm='SHOP_CATALOG_INVALID_INPUT' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'FAIL invalid URL';end if;
 rejected:=false;
 begin perform public.save_shop_catalog_product_presentation(sh,pr,payload,'[]',false,version-interval '1 second');exception when serialization_failure then rejected:=true;end;
 if not rejected then raise exception 'FAIL stale gallery edit';end if;
 saved:=public.save_shop_catalog_product_presentation(sh,pr,payload,'[]',true,version);
 if (saved->>'is_active')::boolean or saved->>'catalog_verified_at' is not null then raise exception 'FAIL image approval invalidation';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;
 begin perform public.save_shop_catalog_product_presentation(sh,pr,payload,g,true,null);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'FAIL unauthorized gallery update';end if;
end $test$;
rollback;