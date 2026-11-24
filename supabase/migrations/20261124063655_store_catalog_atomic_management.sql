-- Row versions must advance even for multiple writes in one transaction.
create or replace function private.shop_touch_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at := clock_timestamp();
 if tg_op='INSERT' then
  new.created_by := coalesce(new.created_by,auth.uid());
 else
  new.updated_at := greatest(new.updated_at,old.updated_at + interval '1 microsecond');
 end if;
 new.updated_by := coalesce(auth.uid(),new.updated_by);
 return new;
end; $$;
revoke all on function private.shop_touch_updated_at() from public,anon,authenticated;

-- Store management is transactional, tenant scoped and safe to retry.
-- Product IDs are generated once by the client and retained after uncertain errors.
create or replace function public.save_shop_catalog_product(
  p_barbershop_id uuid, p_product_id uuid, p_payload jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_existing public.shop_products%rowtype;
  v_input public.shop_products%rowtype;
  v_saved public.shop_products%rowtype;
  v_fields text[] := array['name','brand','category_id','description','product_kind','track_stock',
    'image_url','image_alt','image_source_url','image_source_note','order_options'];
  v_text text;
  v_canonical jsonb;
  v_old jsonb;
  v_typed jsonb;
  v_found boolean;
begin
  if auth.uid() is null or not private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    then raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501'; end if;
  if p_product_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or (p_payload - v_fields)<>'{}'::jsonb then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end if;
  foreach v_text in array array['name','brand','category_id','description','product_kind',
    'image_url','image_alt','image_source_url','image_source_note'] loop
    if p_payload ? v_text and jsonb_typeof(p_payload->v_text) not in ('string','null')
      then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end if;
  end loop;
  if jsonb_typeof(p_payload->'track_stock') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'order_options') is distinct from 'array'
    then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end if;
  if length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 160
    or coalesce(p_payload->>'product_kind','') not in ('consume_here','takeaway','both')
    or length(coalesce(p_payload->>'description',''))>2000
    or jsonb_array_length(p_payload->'order_options')>10
    then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'order_options') e
    where jsonb_typeof(e)<>'string' or length(btrim(e#>>'{}')) not between 1 and 80)
    or (select count(*) from jsonb_array_elements_text(p_payload->'order_options'))<>
       (select count(distinct lower(btrim(x))) from jsonb_array_elements_text(p_payload->'order_options') x)
    then raise exception 'SHOP_PRODUCT_ORDER_OPTIONS_INVALID'; end if;
  if nullif(p_payload->>'image_url','') is not null and (
    p_payload->>'image_url' !~ '^https://[^[:space:]]+$'
    or length(btrim(coalesce(p_payload->>'image_alt',''))) not between 1 and 300
    or length(btrim(coalesce(p_payload->>'image_source_note',''))) not between 1 and 500)
    then raise exception 'IMAGE_METADATA_REQUIRED'; end if;
  if nullif(p_payload->>'image_source_url','') is not null
    and p_payload->>'image_source_url' !~ '^https://[^[:space:]]+$'
    then raise exception 'IMAGE_SOURCE_URL_INVALID'; end if;

  v_canonical := jsonb_build_object(
    'name',btrim(p_payload->>'name'),'brand',nullif(btrim(p_payload->>'brand'),''),
    'category_id',nullif(p_payload->>'category_id',''),'description',nullif(btrim(p_payload->>'description'),''),
    'product_kind',p_payload->>'product_kind','track_stock',p_payload->'track_stock',
    'image_url',nullif(p_payload->>'image_url',''),'image_alt',nullif(btrim(p_payload->>'image_alt'),''),
    'image_source_url',nullif(btrim(p_payload->>'image_source_url'),''),
    'image_source_note',nullif(btrim(p_payload->>'image_source_note'),''),
    'order_options',coalesce((select jsonb_agg(btrim(x) order by ord)
      from jsonb_array_elements_text(p_payload->'order_options') with ordinality a(x,ord)),'[]'::jsonb));
  begin
    v_input := jsonb_populate_record(null::public.shop_products,v_canonical);
  exception when invalid_text_representation then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end;

  select jsonb_object_agg(key,value) into v_typed from jsonb_each(to_jsonb(v_input)) where key=any(v_fields);
  v_canonical := v_typed;

  perform pg_advisory_xact_lock(hashtextextended(p_barbershop_id::text||':catalog:'||p_product_id::text,0));
  if not private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    then raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501'; end if;
  select * into v_existing from public.shop_products
    where id=p_product_id and barbershop_id=p_barbershop_id for update;
  v_found := found;
  if v_found then
    select jsonb_object_agg(key,value) into v_old from jsonb_each(to_jsonb(v_existing)) where key=any(v_fields);
    if v_old=v_canonical then return to_jsonb(v_existing); end if;
    if p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at
      then raise exception 'SHOP_CATALOG_CONFLICT' using errcode='40001'; end if;
    update public.shop_products set name=v_input.name,brand=v_input.brand,category_id=v_input.category_id,
      description=v_input.description,product_kind=v_input.product_kind,track_stock=v_input.track_stock,
      image_url=v_input.image_url,image_alt=v_input.image_alt,image_source_url=v_input.image_source_url,
      image_source_note=v_input.image_source_note,order_options=v_input.order_options
      where id=p_product_id and barbershop_id=p_barbershop_id returning * into v_saved;
  else
    if p_expected_updated_at is not null then raise exception 'SHOP_CATALOG_PRODUCT_NOT_FOUND'; end if;
    insert into public.shop_products(id,barbershop_id,name,brand,category_id,description,product_kind,
      track_stock,image_url,image_alt,image_source_url,image_source_note,order_options,is_active)
    values(p_product_id,p_barbershop_id,v_input.name,v_input.brand,v_input.category_id,v_input.description,
      v_input.product_kind,v_input.track_stock,v_input.image_url,v_input.image_alt,v_input.image_source_url,
      v_input.image_source_note,v_input.order_options,false) returning * into v_saved;
  end if;
  return to_jsonb(v_saved);
exception when unique_violation then raise exception 'SHOP_CATALOG_CONFLICT' using errcode='40001';
end;
$function$;
revoke all on function public.save_shop_catalog_product(uuid,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.save_shop_catalog_product(uuid,uuid,jsonb,timestamptz) to authenticated,service_role;

create or replace function public.publish_shop_catalog_product(
  p_barbershop_id uuid,p_product_id uuid,p_publish boolean,
  p_expected_updated_at timestamptz,p_verification_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_product public.shop_products%rowtype;
begin
  if auth.uid() is null or not private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    then raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501'; end if;
  if p_publish is null then raise exception 'SHOP_CATALOG_INVALID_INPUT'; end if;
  select * into v_product from public.shop_products
    where id=p_product_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_CATALOG_PRODUCT_NOT_FOUND'; end if;
  if not private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    then raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501'; end if;
  if v_product.is_active=p_publish then return to_jsonb(v_product); end if;
  if p_expected_updated_at is null or v_product.updated_at is distinct from p_expected_updated_at
    then raise exception 'SHOP_CATALOG_CONFLICT' using errcode='40001'; end if;
  if p_publish then
    perform public.verify_shop_catalog_product(p_barbershop_id,p_product_id,p_verification_note);
  end if;
  update public.shop_products set is_active=p_publish
    where id=p_product_id and barbershop_id=p_barbershop_id returning * into v_product;
  return to_jsonb(v_product);
end;
$function$;
revoke all on function public.publish_shop_catalog_product(uuid,uuid,boolean,timestamptz,text) from public,anon;
grant execute on function public.publish_shop_catalog_product(uuid,uuid,boolean,timestamptz,text) to authenticated,service_role;
notify pgrst,'reload schema';
