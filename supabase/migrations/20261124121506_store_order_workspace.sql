-- Operational projection: managers do not need team-administration access.
create or replace function public.get_shop_order_workspace(
 p_barbershop_id uuid,p_status text default null,p_limit integer default 25,
 p_offset integer default 0,p_day date default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_timezone text; v_result jsonb;
begin
 if auth.uid() is null or not (private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or private.is_platform_admin()) then
  raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501';
 end if;
 if p_status is not null and p_status not in ('received','needs_confirmation','accepted','preparing','ready','partially_delivered','delivered','cancelled','failed') then raise exception 'INVALID_SHOP_ORDER_FILTER'; end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'INVALID_SHOP_ORDER_PAGINATION'; end if;
 select timezone into v_timezone from public.barbershops where id=p_barbershop_id;
 if not found then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;
 with scoped as materialized (
  select o.*,a.starts_at as appointment_start,a.status as appointment_status,a.customer_id,
   c.name as customer_name,c.phone as customer_phone
  from public.appointment_product_orders o
  join public.appointments a on a.id=o.appointment_id and a.barbershop_id=o.barbershop_id
  join public.customers c on c.id=a.customer_id and c.barbershop_id=a.barbershop_id
  where o.barbershop_id=p_barbershop_id and (p_day is null or
   (a.starts_at>=p_day::timestamp at time zone v_timezone and a.starts_at<(p_day+1)::timestamp at time zone v_timezone))
 ), filtered as materialized (
  select * from scoped where case when p_status is null then status not in ('delivered','cancelled','failed') else status::text=p_status end
 ), page_rows as (
  select * from filtered order by requested_for,id limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'timezone',v_timezone,'total',(select count(*) from filtered),
  'counts',coalesce((select jsonb_object_agg(status,qty) from (select status,count(*) as qty from scoped group by status) x),'{}'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(btrim(p.full_name),''),'Membro '||left(m.user_id::text,8)),'role',m.role) order by p.full_name nulls last,m.user_id)
   from public.barbershop_members m join public.profiles p on p.id=m.user_id where m.barbershop_id=p_barbershop_id),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(jsonb_build_object(
   'id',o.id,'status',o.status,'requested_for',o.requested_for,'customer_note',o.customer_note,'internal_note',o.internal_note,
   'needs_confirmation_reason',o.needs_confirmation_reason,'assigned_to',o.assigned_to,
   'appointment',jsonb_build_object('starts_at',o.appointment_start,'status',o.appointment_status),
   'customer',jsonb_build_object('id',o.customer_id,'name',o.customer_name,'phone',o.customer_phone),
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name_snapshot,'variant',i.variant_snapshot,
    'qty',i.qty,'delivered_qty',i.delivered_qty,'unit_price_minor',i.unit_price_snapshot,'line_total_minor',i.line_total_snapshot,
    'options',i.options,'status',i.status) order by i.created_at,i.id) from public.appointment_product_order_items i
    where i.order_id=o.id and i.barbershop_id=o.barbershop_id),'[]'::jsonb)) order by o.requested_for,o.id) from page_rows o),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$function$;
revoke all on function public.get_shop_order_workspace(uuid,text,integer,integer,date) from public,anon;
grant execute on function public.get_shop_order_workspace(uuid,text,integer,integer,date) to authenticated;

-- Lock order matches the existing audited fulfillment engine. Check the existing
-- operation before the expected quantity so response-loss retries stay idempotent.
create or replace function public.deliver_shop_order_item(
 p_barbershop_id uuid,p_order_id uuid,p_item_id uuid,p_quantity integer,
 p_expected_delivered_qty integer,p_operation_key uuid,p_note text default null
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_delivered integer;
begin
 if auth.uid() is null or not (private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or private.is_platform_admin()) then
  raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501';
 end if;
 if p_quantity is null or p_quantity<1 or p_expected_delivered_qty is null or p_expected_delivered_qty<0 or p_operation_key is null then raise exception 'INVALID_DELIVERED_QUANTITY'; end if;
 perform 1 from public.appointment_product_orders where id=p_order_id and barbershop_id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;
 select delivered_qty into v_delivered from public.appointment_product_order_items where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_ORDER_ITEM_NOT_FOUND' using errcode='P0002'; end if;
 if not exists(select 1 from public.shop_order_operation_events where barbershop_id=p_barbershop_id and order_id=p_order_id and operation_key=p_operation_key) and v_delivered<>p_expected_delivered_qty then
  raise exception 'SHOP_DELIVERY_CONFLICT' using errcode='40001';
 end if;
 return public.update_shop_order_item_operation(p_barbershop_id,p_order_id,p_item_id,'deliver',p_quantity,p_note,p_operation_key);
end;
$function$;
revoke all on function public.deliver_shop_order_item(uuid,uuid,uuid,integer,integer,uuid,text) from public,anon;
grant execute on function public.deliver_shop_order_item(uuid,uuid,uuid,integer,integer,uuid,text) to authenticated;
notify pgrst,'reload schema';
