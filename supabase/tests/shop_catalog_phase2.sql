-- Phase 2 catalogue publication contract. Test fixtures are always rolled back.
begin;
do $catalog_phase2$
declare v_shop uuid; v_cat uuid; v_product uuid; v_variant uuid; v_no_variant uuid; v_rejected boolean;
begin
 insert into public.barbershops(slug,name,status) values('phase2-'||left(replace(gen_random_uuid()::text,'-',''),12),'Phase 2 QA','active') returning id into v_shop;
 perform set_config('request.jwt.claim.role','service_role',true);
 insert into public.shop_product_categories(barbershop_id,name,is_active) values(v_shop,'Category QA',false) returning id into v_cat;
 insert into public.shop_products(barbershop_id,name,is_active) values(v_shop,'No variant QA',false) returning id into v_no_variant;
 v_rejected:=false;
 begin update public.shop_products set is_active=true where id=v_no_variant;
 exception when raise_exception then if position('SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: product without active variant published'; end if;
 insert into public.shop_products(barbershop_id,category_id,name,is_active) values(v_shop,v_cat,'Hidden category QA',false) returning id into v_product;
 insert into public.shop_product_variants(barbershop_id,product_id,label,price_minor,is_active) values(v_shop,v_product,'500 ml',5000,true) returning id into v_variant;
 v_rejected:=false;
 begin update public.shop_products set is_active=true where id=v_product;
 exception when raise_exception then if position('SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED' in sqlerrm)>0 then v_rejected:=true; else raise; end if; end;
 if not v_rejected then raise exception 'FAIL: product under inactive category published'; end if;
 update public.shop_product_categories set is_active=true where id=v_cat;
 update public.shop_products set is_active=true where id=v_product;
 if not exists(select 1 from public.shop_products where id=v_product and is_active) then raise exception 'FAIL: valid product not published'; end if;
 if has_column_privilege('authenticated','public.shop_product_variants','stock_on_hand','UPDATE') then raise exception 'FAIL: direct stock update allowed'; end if;
 if has_column_privilege('authenticated','public.shop_products','image_source_checked_at','UPDATE') then raise exception 'FAIL: browser can forge image verification timestamp'; end if;
 if has_column_privilege('authenticated','public.shop_products','image_authorized_by','UPDATE') then raise exception 'FAIL: browser can forge image approver'; end if;
 if not has_column_privilege('authenticated','public.shop_products','name','UPDATE') then raise exception 'FAIL: catalogue edit privilege missing'; end if;
 if not has_table_privilege('authenticated','public.shop_catalog_audit_events','SELECT') then raise exception 'FAIL: audit read privilege missing'; end if;
end; $catalog_phase2$;
rollback;