-- Forward-only fix: a paid partial delivery has no delivered_at timestamp.
-- Keep recent partially delivered orders visible in the payment queue using updated_at.
create or replace function public.get_shop_order_payment_queue(p_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
 then raise exception 'SHOP_PAYMENTS_FORBIDDEN' using errcode='42501'; end if;
 with delivered_orders as (
  select o.id,o.barbershop_id,o.status::text status,o.requested_for,o.delivered_at,o.updated_at,
   a.starts_at appointment_starts_at,
   coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) due_minor
  from public.appointment_product_orders o
  join public.appointments a on a.id=o.appointment_id and a.barbershop_id=o.barbershop_id
  join public.appointment_product_order_items i on i.order_id=o.id and i.barbershop_id=o.barbershop_id
  where o.barbershop_id=p_barbershop_id and o.status::text in ('delivered','partially_delivered') and i.delivered_qty>0
  group by o.id,o.barbershop_id,o.status,o.requested_for,o.delivered_at,o.updated_at,a.starts_at
 ), payment_totals as (
  select p.order_id,p.barbershop_id,sum(p.amount_minor)::bigint paid_minor
  from public.shop_order_payments p
  where p.barbershop_id=p_barbershop_id group by p.order_id,p.barbershop_id
 ), balanced as (
  select d.*,coalesce(pt.paid_minor,0)::bigint paid_minor,
   greatest(0,d.due_minor-coalesce(pt.paid_minor,0))::bigint balance_minor
  from delivered_orders d
  left join payment_totals pt on pt.order_id=d.id and pt.barbershop_id=d.barbershop_id
 )
 select coalesce(jsonb_agg(x.order_json order by x.sort_at desc),'[]'::jsonb) into v_result
 from (
  select coalesce(b.delivered_at,b.updated_at) sort_at,jsonb_build_object(
   'id',b.id,'status',b.status,'requested_for',b.requested_for,
   'appointment_starts_at',b.appointment_starts_at,
   'due_minor',b.due_minor,'paid_minor',b.paid_minor,'balance_minor',b.balance_minor,
   'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'product_name',i.product_name_snapshot,'variant',i.variant_snapshot,
    'qty',i.qty,'delivered_qty',i.delivered_qty,'unit_price_minor',i.unit_price_snapshot,
    'delivered_value_minor',i.unit_price_snapshot::bigint*i.delivered_qty::bigint
   ) order by i.created_at) from public.appointment_product_order_items i
     where i.order_id=b.id and i.barbershop_id=b.barbershop_id and i.delivered_qty>0),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'amount_minor',p.amount_minor,'payment_method',p.payment_method,
    'confirmation_reference',p.confirmation_reference,'confirmation_note',p.confirmation_note,
    'confirmed_at',p.confirmed_at,'recorded_by',p.recorded_by
   ) order by p.confirmed_at desc) from public.shop_order_payments p
     where p.order_id=b.id and p.barbershop_id=b.barbershop_id),'[]'::jsonb)
  ) order_json
  from balanced b
  where b.due_minor>0
    and (b.balance_minor>0 or coalesce(b.delivered_at,b.updated_at)>=now()-interval '90 days')
  order by coalesce(b.delivered_at,b.updated_at) desc nulls last
  limit 100
 ) x;
 return v_result;
end;
$function$;
revoke all on function public.get_shop_order_payment_queue(uuid) from public,anon;
grant execute on function public.get_shop_order_payment_queue(uuid) to authenticated;
