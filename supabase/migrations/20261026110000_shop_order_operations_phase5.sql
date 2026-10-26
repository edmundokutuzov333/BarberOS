-- BarberOS | Loja da Barbearia | Fase 5: fila operacional e auditoria.
-- Forward-only. The feature flag remains off by default; no production data is seeded.
create table if not exists public.shop_order_operation_events (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  order_id uuid not null references public.appointment_product_orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('status_changed','note_added','item_unavailable','partial_delivery')),
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists shop_order_operation_events_order_created_idx
  on public.shop_order_operation_events (barbershop_id, order_id, created_at desc);
alter table public.shop_order_operation_events enable row level security;
revoke all on public.shop_order_operation_events from public, anon, authenticated;
grant select on public.shop_order_operation_events to authenticated;
grant all on public.shop_order_operation_events to service_role;
create policy shop_order_operation_events_manager_read on public.shop_order_operation_events
for select using (
  public.is_member(barbershop_id, array['owner','manager']::public.app_role[])
  or public.is_platform_admin()
);

alter table public.appointment_product_order_items
  add column if not exists delivered_qty integer not null default 0
  check (delivered_qty >= 0 and delivered_qty <= qty);
alter table public.appointment_product_orders
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists internal_note text,
  add column if not exists needs_confirmation_reason text;

create or replace function public.get_shop_order_queue(p_barbershop_id uuid, p_status text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not (
    public.is_member(p_barbershop_id, array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then
    raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is not null and p_status not in (
    'received','needs_confirmation','accepted','preparing','ready','partially_delivered','delivered','cancelled','failed'
  ) then raise exception 'INVALID_SHOP_ORDER_FILTER'; end if;

  select coalesce(jsonb_agg(q.order_json order by q.requested_for asc), '[]'::jsonb)
  into v_result
  from (
    select o.requested_for,
      jsonb_build_object(
        'id',o.id,'barbershop_id',o.barbershop_id,'appointment_id',o.appointment_id,
        'status',o.status,'requested_for',o.requested_for,'customer_note',o.customer_note,
        'internal_note',o.internal_note,'needs_confirmation_reason',o.needs_confirmation_reason,
        'assigned_to',o.assigned_to,'created_at',o.created_at,'accepted_at',o.accepted_at,
        'ready_at',o.ready_at,'delivered_at',o.delivered_at,'cancelled_at',o.cancelled_at,
        'cancellation_reason',o.cancellation_reason,
        'appointment',jsonb_build_object('starts_at',a.starts_at,'status',a.status,'customer_id',a.customer_id),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',i.id,'product_name',i.product_name_snapshot,'variant',i.variant_snapshot,
            'qty',i.qty,'delivered_qty',i.delivered_qty,'unit_price_minor',i.unit_price_snapshot,
            'line_total_minor',i.line_total_snapshot,'options',i.options,'status',i.status,
            'variant_id',i.variant_id,'product_id',i.product_id
          ) order by i.created_at)
          from public.appointment_product_order_items i
          where i.order_id=o.id and i.barbershop_id=o.barbershop_id
        ),'[]'::jsonb)
      ) as order_json
    from public.appointment_product_orders o
    join public.appointments a on a.id=o.appointment_id and a.barbershop_id=o.barbershop_id
    where o.barbershop_id=p_barbershop_id
      and (p_status is null or o.status::text=p_status)
      and o.status not in ('delivered','cancelled','failed')
  ) q;
  return v_result;
end;
$function$;
revoke all on function public.get_shop_order_queue(uuid,text) from public, anon;
grant execute on function public.get_shop_order_queue(uuid,text) to authenticated;

create or replace function public.update_shop_order_operation(
  p_barbershop_id uuid,
  p_order_id uuid,
  p_action text,
  p_note text default null,
  p_assigned_to uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_order public.appointment_product_orders%rowtype;
  v_actor uuid := auth.uid();
  v_target public.shop_order_status;
begin
  if v_actor is null or not (
    public.is_member(p_barbershop_id, array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;

  if p_action not in ('accept','needs_confirmation','prepare','ready','cancel','fail','assign','note') then
    raise exception 'INVALID_SHOP_ORDER_ACTION';
  end if;
  if p_note is not null and length(btrim(p_note)) > 1000 then raise exception 'SHOP_ORDER_NOTE_TOO_LONG'; end if;

  select * into v_order from public.appointment_product_orders
  where id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if p_action='assign' then
    if p_assigned_to is not null and not exists (
      select 1 from public.barbershop_members m
      where m.barbershop_id=p_barbershop_id and m.user_id=p_assigned_to
    ) then raise exception 'SHOP_ORDER_ASSIGNEE_NOT_MEMBER'; end if;
    update public.appointment_product_orders set assigned_to=p_assigned_to where id=p_order_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note,metadata)
    values(p_barbershop_id,p_order_id,v_actor,'status_changed',p_note,jsonb_build_object('assigned_to',p_assigned_to));
  elsif p_action='note' then
    update public.appointment_product_orders set internal_note=nullif(btrim(p_note), '') where id=p_order_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note)
    values(p_barbershop_id,p_order_id,v_actor,'note_added',nullif(btrim(p_note), ''));
  else
    v_target := case p_action
      when 'accept' then 'accepted'::public.shop_order_status
      when 'needs_confirmation' then 'needs_confirmation'::public.shop_order_status
      when 'prepare' then 'preparing'::public.shop_order_status
      when 'ready' then 'ready'::public.shop_order_status
      when 'cancel' then 'cancelled'::public.shop_order_status
      when 'fail' then 'failed'::public.shop_order_status
    end;
    if p_action='needs_confirmation' and coalesce(length(btrim(p_note)),0)=0 then
      raise exception 'SHOP_ORDER_REASON_REQUIRED';
    end if;
    if p_action='cancel' and coalesce(length(btrim(p_note)),0)=0 then
      raise exception 'SHOP_ORDER_CANCELLATION_REASON_REQUIRED';
    end if;
    update public.appointment_product_orders
    set status=v_target,
        needs_confirmation_reason=case when p_action='needs_confirmation' then btrim(p_note) else needs_confirmation_reason end,
        cancellation_reason=case when p_action='cancel' then btrim(p_note) else cancellation_reason end
    where id=p_order_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,from_status,to_status,note)
    values(p_barbershop_id,p_order_id,v_actor,
      case when p_action='needs_confirmation' then 'item_unavailable' else 'status_changed' end,
      v_order.status::text,v_target::text,nullif(btrim(p_note),''));
  end if;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'action',p_action);
end;
$function$;
revoke all on function public.update_shop_order_operation(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.update_shop_order_operation(uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.update_shop_order_item_operation(
  p_barbershop_id uuid,
  p_order_id uuid,
  p_item_id uuid,
  p_action text,
  p_delivered_qty integer default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_order public.appointment_product_orders%rowtype;
  v_item public.appointment_product_order_items%rowtype;
  v_status public.shop_order_item_status;
  v_track_stock boolean;
  v_remaining_reserved integer;
  v_reservation record;
begin
  if v_actor is null or not (
    public.is_member(p_barbershop_id, array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;
  if p_action not in ('accept','prepare','ready','unavailable','deliver','cancel') then raise exception 'INVALID_SHOP_ITEM_ACTION'; end if;
  if p_note is not null and length(btrim(p_note)) > 1000 then raise exception 'SHOP_ORDER_NOTE_TOO_LONG'; end if;

  select * into v_order from public.appointment_product_orders
    where id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_item from public.appointment_product_order_items
    where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_ITEM_NOT_FOUND' using errcode='P0002'; end if;

  v_status := case p_action
    when 'accept' then 'accepted'::public.shop_order_item_status
    when 'prepare' then 'preparing'::public.shop_order_item_status
    when 'ready' then 'ready'::public.shop_order_item_status
    when 'unavailable' then 'unavailable'::public.shop_order_item_status
    when 'deliver' then 'delivered'::public.shop_order_item_status
    when 'cancel' then 'cancelled'::public.shop_order_item_status
  end;
  if p_action='unavailable' and coalesce(length(btrim(p_note)),0)=0 then raise exception 'SHOP_ORDER_REASON_REQUIRED'; end if;
  if p_action='deliver' then
    if v_item.status not in ('ready','partially_delivered') then
      raise exception 'SHOP_ITEM_NOT_READY';
    end if;
    if p_delivered_qty is null or p_delivered_qty < 1 or p_delivered_qty > v_item.qty then
      raise exception 'INVALID_DELIVERED_QUANTITY';
    end if;
    if v_item.delivered_qty + p_delivered_qty > v_item.qty then raise exception 'DELIVERED_QUANTITY_EXCEEDS_ORDER'; end if;
    select p.track_stock into v_track_stock
    from public.shop_product_variants v
    join public.shop_products p on p.id=v.product_id and p.barbershop_id=v.barbershop_id
    where v.id=v_item.variant_id and v.barbershop_id=p_barbershop_id;
    if coalesce(v_track_stock,false) then
      perform public.record_shop_inventory_movement(
        p_barbershop_id,v_item.variant_id,-p_delivered_qty,'sale',
        'Entrega do pedido ' || left(p_order_id::text,8)
      );
      v_remaining_reserved := p_delivered_qty;
      for v_reservation in
        select id,qty from public.inventory_reservations
        where order_id=p_order_id and barbershop_id=p_barbershop_id
          and variant_id=v_item.variant_id and status='reserved'
        order by created_at for update
      loop
        exit when v_remaining_reserved <= 0;
        if v_remaining_reserved >= v_reservation.qty then
          update public.inventory_reservations set status='consumed',released_at=now(),updated_at=now()
          where id=v_reservation.id;
          v_remaining_reserved := v_remaining_reserved-v_reservation.qty;
        else
          update public.inventory_reservations set qty=qty-v_remaining_reserved,updated_at=now()
          where id=v_reservation.id;
          v_remaining_reserved := 0;
        end if;
      end loop;
    end if;
    update public.appointment_product_order_items
      set delivered_qty=delivered_qty+p_delivered_qty,
          status=case when delivered_qty+p_delivered_qty=qty then 'delivered'::public.shop_order_item_status else 'partially_delivered'::public.shop_order_item_status end
      where id=p_item_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note,metadata)
      values(p_barbershop_id,p_order_id,v_actor,'partial_delivery',nullif(btrim(p_note),''),jsonb_build_object('item_id',p_item_id,'delivered_qty',p_delivered_qty,'stock_decremented',coalesce(v_track_stock,false)));
  else
    update public.appointment_product_order_items set status=v_status where id=p_item_id;
    if p_action='unavailable' then
      insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note,metadata)
      values(p_barbershop_id,p_order_id,v_actor,'item_unavailable',btrim(p_note),jsonb_build_object('item_id',p_item_id));
      update public.appointment_product_orders set status='needs_confirmation',needs_confirmation_reason=btrim(p_note)
      where id=p_order_id and status in ('received','accepted','preparing');
    end if;
  end if;

  if p_action='deliver' then
    if exists(select 1 from public.appointment_product_order_items where order_id=p_order_id and status in ('delivered','partially_delivered'))
       and exists(select 1 from public.appointment_product_order_items where order_id=p_order_id and status<>'delivered') then
      update public.appointment_product_orders set status='partially_delivered' where id=p_order_id and status in ('preparing','ready');
    elsif not exists(select 1 from public.appointment_product_order_items where order_id=p_order_id and status<>'delivered') then
      update public.appointment_product_orders set status='delivered' where id=p_order_id and status in ('ready','partially_delivered');
    end if;
  end if;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,'status',v_status::text);
end;
$function$;
revoke all on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text) from public, anon;
grant execute on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text) to authenticated;
