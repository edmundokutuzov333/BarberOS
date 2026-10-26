-- Phase 7: tenant-scoped catalogue verification, image approval and revalidation.
begin;
do $shop_catalog_phase7$
declare
 v_actor uuid:=gen_random_uuid();v_shop uuid;v_category uuid;v_product uuid;v_variant uuid;v_notification uuid;
 v_result jsonb;v_rejected boolean;v_read_by uuid;v_read_at timestamptz;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','phase7-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('phase7-'||left(replace(gen_random_uuid()::text,'-',''),12),'BarberOS Phase 7 QA','active','Africa/Maputo',30,120,15)
 returning id into v_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);

 insert into public.shop_product_categories(barbershop_id,name,is_active) values(v_shop,'Categoria verificada QA',true) returning id into v_category;
 insert into public.shop_products(barbershop_id,category_id,brand,name,description,image_url,image_alt,image_source_url,image_source_note,product_kind,track_stock,is_active)
 values(v_shop,v_category,'Marca QA','Produto QA','Artigo físico de teste isolado','https://example.invalid/product.jpg','Fotografia de teste isolada',
 'https://example.invalid/source','Fotografia própria de teste; permissão confirmada.','takeaway',true,false) returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,sku,label,attributes,unit_label,price_minor,stock_on_hand,is_active)
 values(v_shop,v_product,'PHASE7-QA-001','500 ml','{}'::jsonb,'unidade',5000,5,true) returning id into v_variant;

 v_result:=public.verify_shop_catalog_product(v_shop,v_product,'Fornecedor conferido; marca, SKU, embalagem, preço e stock verificados fisicamente.');
 if v_result->>'product_id'<>v_product::text then raise exception 'FAIL: verification RPC did not return product'; end if;
 if not exists(select 1 from public.shop_products p where p.id=v_product and p.catalog_verified_at is not null and p.catalog_verified_by=v_actor and p.catalog_verification_note is not null)
 then raise exception 'FAIL: catalogue verification not persisted'; end if;
 update public.shop_products set is_active=true where id=v_product and barbershop_id=v_shop;
 if not exists(select 1 from public.shop_products where id=v_product and is_active) then raise exception 'FAIL: verified product could not be published'; end if;
 v_result:=public.get_shop_phase7_catalog_readiness(v_shop);
 if not coalesce((v_result->>'catalog_ready')::boolean,false) then raise exception 'FAIL: valid catalogue not ready: %',v_result; end if;
 if coalesce((v_result->>'shop_enabled')::boolean,true) then raise exception 'FAIL: verification enabled public rollout'; end if;

 update public.shop_products set name='Produto QA alterado' where id=v_product and barbershop_id=v_shop;
 if exists(select 1 from public.shop_products where id=v_product and (is_active or catalog_verified_at is not null or catalog_verified_by is not null))
 then raise exception 'FAIL: catalogue change did not invalidate approval'; end if;
 v_rejected:=false;
 begin update public.shop_products set is_active=true where id=v_product and barbershop_id=v_shop;
 exception when raise_exception then if position('SHOP_PRODUCT_CATALOG_NOT_VERIFIED' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: unverified product publication was not rejected'; end if;

 insert into public.shop_notification_events(barbershop_id,event_type,title,body) values(v_shop,'order_received','Alerta QA','Notificação de teste transaccional') returning id into v_notification;
 if not public.mark_shop_notification_read(v_shop,v_notification) then raise exception 'FAIL: alert acknowledgement not confirmed'; end if;
 select read_by,read_at into v_read_by,v_read_at from public.shop_notification_events where id=v_notification;
 if v_read_by is distinct from v_actor or v_read_at is null then raise exception 'FAIL: acknowledgement actor/time missing'; end if;
 if has_table_privilege('authenticated','public.shop_notification_events','UPDATE') then raise exception 'FAIL: direct update privilege still granted'; end if;
 raise notice 'PASS | Phase 7: tenant-scoped product approval, provenance, publish guard, invalidation, feature flag remains off, RPC-only alert acknowledgement.';
end;
$shop_catalog_phase7$;
rollback;
