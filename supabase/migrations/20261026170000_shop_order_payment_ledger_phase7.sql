-- BarberOS | Fase 7 | ledger imutável de pagamentos de produtos confirmados pela equipa.
-- Não reutiliza payments de marcações nem declara liquidação automática de providers.
create table if not exists public.shop_order_payments (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 order_id uuid not null,
 amount_minor bigint not null check(amount_minor>0),
 payment_method text not null check(payment_method in ('cash','pos','mpesa','emola','bank_transfer','other')),
 confirmation_reference text,
 confirmation_note text not null check(length(btrim(confirmation_note)) between 12 and 500),
 idempotency_key uuid not null,
 recorded_by uuid references auth.users(id) on delete set null,
 confirmed_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(),
 constraint shop_order_payments_order_tenant_fkey foreign key(order_id,barbershop_id)
   references public.appointment_product_orders(id,barbershop_id) on delete restrict,
 constraint shop_order_payments_reference_check check(confirmation_reference is null or length(btrim(confirmation_reference)) between 3 and 160),
 constraint shop_order_payments_external_reference_required check(payment_method not in ('pos','mpesa','emola','bank_transfer') or confirmation_reference is not null),
 constraint shop_order_payments_idempotency_unique unique(barbershop_id,order_id,idempotency_key)
);
create index if not exists shop_order_payments_shop_confirmed_idx on public.shop_order_payments(barbershop_id,confirmed_at desc);
create index if not exists shop_order_payments_order_confirmed_idx on public.shop_order_payments(order_id,barbershop_id,confirmed_at desc);
create index if not exists shop_order_payments_recorded_by_fk_idx on public.shop_order_payments(recorded_by);
alter table public.shop_order_payments enable row level security;
revoke all on public.shop_order_payments from public,anon,authenticated;
grant select on public.shop_order_payments to authenticated;
grant all on public.shop_order_payments to service_role;
drop policy if exists shop_order_payments_manager_read on public.shop_order_payments;
create policy shop_order_payments_manager_read on public.shop_order_payments
for select to authenticated using(public.is_member(barbershop_id,array['owner','manager']::public.app_role[]));

create or replace function public.record_shop_order_payment(
 p_barbershop_id uuid,p_order_id uuid,p_amount_minor bigint,p_payment_method text,
 p_confirmation_reference text,p_confirmation_note text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=auth.uid(); v_order public.appointment_product_orders%rowtype;
 v_existing public.shop_order_payments%rowtype; v_payment public.shop_order_payments%rowtype;
 v_due bigint; v_paid bigint; v_balance bigint;
 v_reference text:=nullif(btrim(p_confirmation_reference),'');
 v_note text:=nullif(btrim(p_confirmation_note),'');
begin
 if v_actor is null or not public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
 then raise exception 'SHOP_PAYMENT_FORBIDDEN' using errcode='42501'; end if;
 if p_amount_minor is null or p_amount_minor<1 then raise exception 'SHOP_PAYMENT_AMOUNT_INVALID'; end if;
 if p_payment_method not in ('cash','pos','mpesa','emola','bank_transfer','other') then raise exception 'SHOP_PAYMENT_METHOD_INVALID'; end if;
 if p_idempotency_key is null then raise exception 'SHOP_PAYMENT_IDEMPOTENCY_KEY_REQUIRED'; end if;
 if v_note is null or length(v_note) not between 12 and 500 then raise exception 'SHOP_PAYMENT_CONFIRMATION_NOTE_REQUIRED'; end if;
 if p_payment_method in ('pos','mpesa','emola','bank_transfer') and (v_reference is null or length(v_reference) not between 3 and 160)
 then raise exception 'SHOP_PAYMENT_REFERENCE_REQUIRED'; end if;
 if v_reference is not null and length(v_reference) not between 3 and 160 then raise exception 'SHOP_PAYMENT_REFERENCE_INVALID'; end if;
 select * into v_order from public.appointment_product_orders o
 where o.id=p_order_id and o.barbershop_id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_PAYMENT_ORDER_NOT_FOUND' using errcode='P0002'; end if;
 if v_order.status::text not in ('delivered','partially_delivered') then raise exception 'SHOP_PAYMENT_ORDER_NOT_DELIVERED'; end if;
 select * into v_existing from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.order_id=p_order_id and p.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.amount_minor<>p_amount_minor or v_existing.payment_method<>p_payment_method
   or v_existing.confirmation_reference is distinct from v_reference or v_existing.confirmation_note is distinct from v_note
  then raise exception 'SHOP_PAYMENT_IDEMPOTENCY_CONFLICT'; end if;
  select coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) into v_due from public.appointment_product_order_items i where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id;
  select coalesce(sum(p.amount_minor),0) into v_paid from public.shop_order_payments p where p.order_id=p_order_id and p.barbershop_id=p_barbershop_id;
  return jsonb_build_object('payment_id',v_existing.id,'order_id',p_order_id,'amount_minor',v_existing.amount_minor,
   'due_minor',v_due,'paid_minor',v_paid,'balance_minor',greatest(0,v_due-v_paid),'idempotent',true,
   'confirmation_model','staff_confirmed_not_provider_reconciled');
 end if;
 select coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) into v_due from public.appointment_product_order_items i where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id;
 if v_due<1 then raise exception 'SHOP_PAYMENT_NO_DELIVERED_VALUE'; end if;
 select coalesce(sum(p.amount_minor),0) into v_paid from public.shop_order_payments p where p.order_id=p_order_id and p.barbershop_id=p_barbershop_id;
 v_balance:=v_due-v_paid;
 if v_balance<1 then raise exception 'SHOP_PAYMENT_ORDER_ALREADY_SETTLED'; end if;
 if p_amount_minor>v_balance then raise exception 'SHOP_PAYMENT_EXCEEDS_BALANCE'; end if;
 insert into public.shop_order_payments(barbershop_id,order_id,amount_minor,payment_method,confirmation_reference,confirmation_note,idempotency_key,recorded_by)
 values(p_barbershop_id,p_order_id,p_amount_minor,p_payment_method,v_reference,v_note,p_idempotency_key,v_actor) returning * into v_payment;
 v_paid:=v_paid+v_payment.amount_minor;
 return jsonb_build_object('payment_id',v_payment.id,'order_id',p_order_id,'amount_minor',v_payment.amount_minor,
  'due_minor',v_due,'paid_minor',v_paid,'balance_minor',greatest(0,v_due-v_paid),'idempotent',false,
  'confirmation_model','staff_confirmed_not_provider_reconciled');
end;
$function$;
revoke all on function public.record_shop_order_payment(uuid,uuid,bigint,text,text,text,uuid) from public,anon;
grant execute on function public.record_shop_order_payment(uuid,uuid,bigint,text,text,text,uuid) to authenticated;

create or replace function public.get_shop_order_payment_queue(p_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
 then raise exception 'SHOP_PAYMENTS_FORBIDDEN' using errcode='42501'; end if;
 with delivered_orders as (
  select o.id,o.barbershop_id,o.status::text status,o.requested_for,o.delivered_at,a.starts_at appointment_starts_at,
   coalesce(sum(i.unit_price_snapshot::bigint*i.delivered_qty::bigint),0) due_minor
  from public.appointment_product_orders o join public.appointments a on a.id=o.appointment_id and a.barbershop_id=o.barbershop_id
  join public.appointment_product_order_items i on i.order_id=o.id and i.barbershop_id=o.barbershop_id
  where o.barbershop_id=p_barbershop_id and o.status::text in ('delivered','partially_delivered') and i.delivered_qty>0
  group by o.id,o.barbershop_id,o.status,o.requested_for,o.delivered_at,a.starts_at
 ), payment_totals as (
  select p.order_id,p.barbershop_id,sum(p.amount_minor)::bigint paid_minor from public.shop_order_payments p
  where p.barbershop_id=p_barbershop_id group by p.order_id,p.barbershop_id
 ), balanced as (
  select d.*,coalesce(pt.paid_minor,0)::bigint paid_minor,greatest(0,d.due_minor-coalesce(pt.paid_minor,0))::bigint balance_minor
  from delivered_orders d left join payment_totals pt on pt.order_id=d.id and pt.barbershop_id=d.barbershop_id
 )
 select coalesce(jsonb_agg(x.order_json order by x.sort_at desc),'[]'::jsonb) into v_result from (
  select b.delivered_at sort_at,jsonb_build_object(
   'id',b.id,'status',b.status,'requested_for',b.requested_for,'appointment_starts_at',b.appointment_starts_at,
   'due_minor',b.due_minor,'paid_minor',b.paid_minor,'balance_minor',b.balance_minor,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name_snapshot,'variant',i.variant_snapshot,
    'qty',i.qty,'delivered_qty',i.delivered_qty,'unit_price_minor',i.unit_price_snapshot,
    'delivered_value_minor',i.unit_price_snapshot::bigint*i.delivered_qty::bigint) order by i.created_at)
    from public.appointment_product_order_items i where i.order_id=b.id and i.barbershop_id=b.barbershop_id and i.delivered_qty>0),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount_minor',p.amount_minor,'payment_method',p.payment_method,
    'confirmation_reference',p.confirmation_reference,'confirmation_note',p.confirmation_note,'confirmed_at',p.confirmed_at,'recorded_by',p.recorded_by)
    order by p.confirmed_at desc) from public.shop_order_payments p where p.order_id=b.id and p.barbershop_id=b.barbershop_id),'[]'::jsonb)
  ) order_json from balanced b where b.due_minor>0 and (b.balance_minor>0 or b.delivered_at>=now()-interval '90 days')
  order by b.delivered_at desc nulls last limit 100
 ) x;
 return v_result;
end;
$function$;
revoke all on function public.get_shop_order_payment_queue(uuid) from public,anon;
grant execute on function public.get_shop_order_payment_queue(uuid) to authenticated;

create or replace function public.get_shop_phase6_report(p_barbershop_id uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_result jsonb; v_from timestamptz; v_to timestamptz;
begin
 if auth.uid() is null or not (public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin())
 then raise exception 'SHOP_REPORT_FORBIDDEN' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then raise exception 'SHOP_REPORT_INVALID_RANGE'; end if;
 v_from:=p_from::timestamp at time zone 'Africa/Maputo'; v_to:=(p_to+1)::timestamp at time zone 'Africa/Maputo';
 select jsonb_build_object(
  'from',p_from,'to',p_to,
  'orders_received',count(*) filter(where o.created_at>=v_from and o.created_at<v_to),
  'orders_accepted',count(*) filter(where o.accepted_at>=v_from and o.accepted_at<v_to),
  'orders_ready',count(*) filter(where o.ready_at>=v_from and o.ready_at<v_to),
  'orders_delivered',count(*) filter(where o.delivered_at>=v_from and o.delivered_at<v_to),
  'orders_cancelled',count(*) filter(where o.cancelled_at>=v_from and o.cancelled_at<v_to),
  'items_requested',coalesce((select sum(i.qty) from public.appointment_product_order_items i join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
  'items_delivered',coalesce((select sum(i.delivered_qty) from public.appointment_product_order_items i join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
  'low_stock_variants',(select count(*) from public.shop_product_variants v join public.shop_products p on p.id=v.product_id and p.barbershop_id=v.barbershop_id where v.barbershop_id=p_barbershop_id and p.is_active and v.is_active and p.track_stock and v.stock_on_hand<=v.low_stock_threshold),
  'unread_internal_alerts',(select count(*) from public.shop_notification_events n where n.barbershop_id=p_barbershop_id and n.read_at is null),
  'external_provider_failures',(select count(*) from public.shop_notification_events n where n.barbershop_id=p_barbershop_id and n.delivery_channel in ('email','whatsapp') and n.delivery_status='failed' and n.occurred_at>=v_from and n.occurred_at<v_to),
  'paid_revenue_minor',coalesce((select sum(p.amount_minor) from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.confirmed_at>=v_from and p.confirmed_at<v_to),0),
  'paid_revenue_status','staff_confirmed_shop_payments_not_provider_reconciled',
  'payment_records_count',(select count(*) from public.shop_order_payments p where p.barbershop_id=p_barbershop_id and p.confirmed_at>=v_from and p.confirmed_at<v_to),
  'payment_note','Registos confirmados por owner/manager e associados a artigos entregues. Não são reconciliação automática com M-Pesa, e-Mola, POS ou banco; os providers têm de ser verificados separadamente.'
 ) into v_result from public.appointment_product_orders o where o.barbershop_id=p_barbershop_id;
 return v_result;
end;
$function$;
revoke all on function public.get_shop_phase6_report(uuid,date,date) from public,anon;
grant execute on function public.get_shop_phase6_report(uuid,date,date) to authenticated;
