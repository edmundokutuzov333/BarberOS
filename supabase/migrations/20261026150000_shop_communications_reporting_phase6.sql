-- BarberOS | Loja da Barbearia | Fase 6: alertas internos e reporting operacional.
-- Forward-only. Does not enable the shop or claim external notification/payment delivery.

create table if not exists public.shop_notification_events (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  order_id uuid references public.appointment_product_orders(id) on delete set null,
  event_type text not null check (event_type in (
    'order_received','order_accepted','order_needs_confirmation','order_ready',
    'order_delivered','order_cancelled','order_failed'
  )),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 500),
  delivery_channel text not null default 'internal' check (delivery_channel in ('internal','email','whatsapp')),
  delivery_status text not null default 'visible' check (delivery_status in ('visible','queued','sent','delivered','failed','not_configured')),
  provider_message_id text,
  provider_error_code text,
  occurred_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);
create index if not exists shop_notification_events_inbox_idx
  on public.shop_notification_events(barbershop_id, occurred_at desc) where read_at is null;
create index if not exists shop_notification_events_order_idx
  on public.shop_notification_events(barbershop_id, order_id, occurred_at desc);
alter table public.shop_notification_events enable row level security;
revoke all on public.shop_notification_events from public, anon, authenticated;
grant select, update on public.shop_notification_events to authenticated;
grant all on public.shop_notification_events to service_role;
drop policy if exists shop_notification_events_manager_read on public.shop_notification_events;
create policy shop_notification_events_manager_read on public.shop_notification_events
for select to authenticated using (
  public.is_member(barbershop_id, array['owner','manager']::public.app_role[])
  or public.is_platform_admin()
);
drop policy if exists shop_notification_events_manager_mark_read on public.shop_notification_events;
create policy shop_notification_events_manager_mark_read on public.shop_notification_events
for update to authenticated using (
  public.is_member(barbershop_id, array['owner','manager']::public.app_role[])
  or public.is_platform_admin()
) with check (
  public.is_member(barbershop_id, array['owner','manager']::public.app_role[])
  or public.is_platform_admin()
);

create or replace function private.emit_shop_order_notification()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_type text; v_title text; v_body text;
begin
  if tg_op='INSERT' then
    v_type := 'order_received';
    v_title := 'Novo pedido de produtos';
    v_body := 'Foi recebido um pedido associado a uma marcação. Reveja a disponibilidade na fila da Loja.';
  elsif new.status is distinct from old.status then
    v_type := case new.status::text
      when 'accepted' then 'order_accepted'
      when 'needs_confirmation' then 'order_needs_confirmation'
      when 'ready' then 'order_ready'
      when 'delivered' then 'order_delivered'
      when 'cancelled' then 'order_cancelled'
      when 'failed' then 'order_failed'
      else null
    end;
    v_title := case v_type
      when 'order_accepted' then 'Pedido aceite'
      when 'order_needs_confirmation' then 'Pedido precisa de confirmação'
      when 'order_ready' then 'Pedido pronto'
      when 'order_delivered' then 'Pedido entregue'
      when 'order_cancelled' then 'Pedido cancelado'
      when 'order_failed' then 'Pedido não cumprido'
      else null end;
    v_body := case v_type
      when 'order_accepted' then 'A equipa aceitou o pedido. O pagamento não é inferido.'
      when 'order_needs_confirmation' then 'Existe uma indisponibilidade ou decisão operacional pendente.'
      when 'order_ready' then 'A equipa marcou o pedido como pronto.'
      when 'order_delivered' then 'A entrega foi registada. Confirme o pagamento separadamente.'
      when 'order_cancelled' then 'O pedido foi cancelado. Consulte o histórico e o stock.'
      when 'order_failed' then 'O pedido não foi cumprido. Consulte a causa registada.'
      else null end;
  end if;
  if v_type is not null then
    insert into public.shop_notification_events(
      barbershop_id,order_id,event_type,title,body,delivery_channel,delivery_status,metadata
    ) values (
      new.barbershop_id,new.id,v_type,v_title,v_body,'internal','visible',
      jsonb_build_object('order_status',new.status::text)
    );
  end if;
  return new;
end;
$function$;
drop trigger if exists shop_order_notification_after_insert on public.appointment_product_orders;
create trigger shop_order_notification_after_insert after insert on public.appointment_product_orders
for each row execute function private.emit_shop_order_notification();
drop trigger if exists shop_order_notification_after_status_update on public.appointment_product_orders;
create trigger shop_order_notification_after_status_update after update of status on public.appointment_product_orders
for each row when (old.status is distinct from new.status)
execute function private.emit_shop_order_notification();
revoke all on function private.emit_shop_order_notification() from public, anon, authenticated;

create or replace function public.get_shop_phase6_report(p_barbershop_id uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_result jsonb; v_from timestamptz; v_to timestamptz;
begin
  if auth.uid() is null or not (
    public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_REPORT_FORBIDDEN' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>366 then
    raise exception 'SHOP_REPORT_INVALID_RANGE';
  end if;
  v_from := p_from::timestamp at time zone 'Africa/Maputo';
  v_to := (p_to+1)::timestamp at time zone 'Africa/Maputo';
  select jsonb_build_object(
    'from',p_from,'to',p_to,
    'orders_received',count(*) filter (where o.created_at>=v_from and o.created_at<v_to),
    'orders_accepted',count(*) filter (where o.accepted_at>=v_from and o.accepted_at<v_to),
    'orders_ready',count(*) filter (where o.ready_at>=v_from and o.ready_at<v_to),
    'orders_delivered',count(*) filter (where o.delivered_at>=v_from and o.delivered_at<v_to),
    'orders_cancelled',count(*) filter (where o.cancelled_at>=v_from and o.cancelled_at<v_to),
    'items_requested',coalesce((select sum(i.qty) from public.appointment_product_order_items i
      join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id
      where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
    'items_delivered',coalesce((select sum(i.delivered_qty) from public.appointment_product_order_items i
      join public.appointment_product_orders oi on oi.id=i.order_id and oi.barbershop_id=i.barbershop_id
      where i.barbershop_id=p_barbershop_id and oi.created_at>=v_from and oi.created_at<v_to),0),
    'low_stock_variants',(select count(*) from public.shop_product_variants v
      join public.shop_products p on p.id=v.product_id and p.barbershop_id=v.barbershop_id
      where v.barbershop_id=p_barbershop_id and p.is_active and v.is_active
        and p.track_stock and v.stock_on_hand<=v.low_stock_threshold),
    'unread_internal_alerts',(select count(*) from public.shop_notification_events n
      where n.barbershop_id=p_barbershop_id and n.read_at is null),
    'external_provider_failures',(select count(*) from public.shop_notification_events n
      where n.barbershop_id=p_barbershop_id and n.delivery_channel in ('email','whatsapp')
        and n.delivery_status='failed' and n.occurred_at>=v_from and n.occurred_at<v_to),
    'paid_revenue_minor',null,
    'paid_revenue_status','unavailable_no_verified_shop_payment_linkage',
    'payment_note','Pedidos e entregas não são prova de pagamento. A receita paga só será reportada quando existir ligação a pagamentos reais verificados.'
  ) into v_result from public.appointment_product_orders o
  where o.barbershop_id=p_barbershop_id;
  return v_result;
end;
$function$;
revoke all on function public.get_shop_phase6_report(uuid,date,date) from public,anon;
grant execute on function public.get_shop_phase6_report(uuid,date,date) to authenticated;

create or replace function public.get_shop_notification_inbox(p_barbershop_id uuid,p_limit integer default 50)
returns setof public.shop_notification_events
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_NOTIFICATIONS_FORBIDDEN' using errcode='42501'; end if;
  if p_limit<1 or p_limit>100 then raise exception 'SHOP_NOTIFICATIONS_INVALID_LIMIT'; end if;
  return query select n.* from public.shop_notification_events n
  where n.barbershop_id=p_barbershop_id order by n.occurred_at desc limit p_limit;
end;
$function$;
revoke all on function public.get_shop_notification_inbox(uuid,integer) from public,anon;
grant execute on function public.get_shop_notification_inbox(uuid,integer) to authenticated;
