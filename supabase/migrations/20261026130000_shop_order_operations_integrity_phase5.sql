-- BarberOS | Fase 5 | integridade operacional, idempotência e reposição.
-- Forward-only. Safe to replay; applies after the Phase 5 queue migration.
alter table public.shop_order_operation_events
  add column if not exists operation_key uuid;

alter table public.shop_order_operation_events
  drop constraint if exists shop_order_operation_events_event_type_check;
alter table public.shop_order_operation_events
  add constraint shop_order_operation_events_event_type_check
  check (event_type in ('status_changed','note_added','item_unavailable','partial_delivery','assigned'));

create unique index if not exists shop_order_operation_events_operation_key_uidx
  on public.shop_order_operation_events (barbershop_id, order_id, operation_key)
  where operation_key is not null;

CREATE OR REPLACE FUNCTION private.shop_order_item_status_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status='requested' and new.status in ('accepted','unavailable','cancelled'))
      or (old.status='accepted' and new.status in ('preparing','ready','unavailable','cancelled','failed'))
      or (old.status='preparing' and new.status in ('ready','partially_delivered','unavailable','cancelled','failed'))
      or (old.status='ready' and new.status in ('partially_delivered','delivered','unavailable','cancelled','failed'))
      or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
      or (old.status='unavailable' and new.status in ('accepted','cancelled'))
    ) then
      raise exception 'INVALID_SHOP_ORDER_ITEM_TRANSITION: % -> %',old.status,new.status
        using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_shop_order_item_operation(p_barbershop_id uuid, p_order_id uuid, p_item_id uuid, p_action text, p_delivered_qty integer DEFAULT NULL::integer, p_note text DEFAULT NULL::text, p_operation_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.appointment_product_orders%rowtype;
  v_item public.appointment_product_order_items%rowtype;
  v_target public.shop_order_item_status;
  v_track_stock boolean := false;
  v_remaining_reserved integer;
  v_reservation record;
  v_existing jsonb;
  v_response jsonb;
  v_item_status text;
  v_delivered_total integer;
begin
  if v_actor is null or not (
    public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;
  if p_action not in ('accept','prepare','ready','unavailable','deliver','cancel') then raise exception 'INVALID_SHOP_ITEM_ACTION'; end if;
  if p_note is not null and length(btrim(p_note))>1000 then raise exception 'SHOP_ORDER_NOTE_TOO_LONG'; end if;
  if p_action in ('unavailable','cancel') and coalesce(length(btrim(p_note)),0)=0 then
    if p_action='unavailable' then raise exception 'SHOP_ORDER_REASON_REQUIRED';
    else raise exception 'SHOP_ORDER_ITEM_CANCELLATION_REASON_REQUIRED'; end if;
  end if;
  if p_action='deliver' and p_operation_key is null then raise exception 'SHOP_OPERATION_KEY_REQUIRED'; end if;

  select * into v_order from public.appointment_product_orders
  where id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_item from public.appointment_product_order_items
  where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_ITEM_NOT_FOUND' using errcode='P0002'; end if;

  if p_action='deliver' then
    select e.metadata into v_existing from public.shop_order_operation_events e
    where e.barbershop_id=p_barbershop_id and e.order_id=p_order_id and e.operation_key=p_operation_key
    for update;
    if found then
      if v_existing->>'item_id' is distinct from p_item_id::text
         or v_existing->>'requested_qty' is distinct from p_delivered_qty::text then
        raise exception 'SHOP_OPERATION_KEY_REUSED';
      end if;
      return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,
        'status',v_existing->>'item_status','delivered_qty',(v_existing->>'delivered_qty_total')::integer,'idempotent',true);
    end if;
    if v_order.status in ('cancelled','failed','delivered') then raise exception 'SHOP_ORDER_TERMINAL'; end if;
    if v_item.status not in ('ready','partially_delivered') then raise exception 'SHOP_ITEM_NOT_READY'; end if;
    if p_delivered_qty is null or p_delivered_qty<1 or p_delivered_qty>v_item.qty-v_item.delivered_qty then
      raise exception 'INVALID_DELIVERED_QUANTITY';
    end if;

    if v_order.status='preparing' then
      if exists(select 1 from public.appointment_product_order_items i
        where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id and i.status not in ('ready','delivered')) then
        raise exception 'SHOP_ORDER_ITEMS_NOT_READY';
      end if;
      update public.appointment_product_orders set status='ready'
      where id=p_order_id and barbershop_id=p_barbershop_id;
      select * into v_order from public.appointment_product_orders where id=p_order_id and barbershop_id=p_barbershop_id;
    end if;
    if v_order.status not in ('ready','partially_delivered') then raise exception 'SHOP_ORDER_NOT_READY'; end if;

    select p.track_stock into v_track_stock
    from public.shop_product_variants v join public.shop_products p
      on p.id=v.product_id and p.barbershop_id=v.barbershop_id
    where v.id=v_item.variant_id and v.barbershop_id=p_barbershop_id;

    if coalesce(v_track_stock,false) then
      v_remaining_reserved := p_delivered_qty;
      for v_reservation in
        select r.id,r.qty,r.expires_at from public.inventory_reservations r
        where r.order_id=p_order_id and r.barbershop_id=p_barbershop_id
          and r.variant_id=v_item.variant_id and r.status='reserved'
          and (r.expires_at is null or r.expires_at>now())
        order by r.created_at,r.id for update
      loop
        exit when v_remaining_reserved<=0;
        if v_remaining_reserved>=v_reservation.qty then
          update public.inventory_reservations set status='consumed',released_at=now() where id=v_reservation.id;
          v_remaining_reserved := v_remaining_reserved-v_reservation.qty;
        else
          update public.inventory_reservations set status='released' where id=v_reservation.id;
          insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
          values(p_barbershop_id,p_order_id,v_item.variant_id,v_reservation.qty-v_remaining_reserved,'reserved',v_reservation.expires_at);
          v_remaining_reserved := 0;
        end if;
      end loop;
      if v_remaining_reserved>0 then raise exception 'SHOP_RESERVATION_INSUFFICIENT'; end if;
      perform public.record_shop_inventory_movement(
        p_barbershop_id,v_item.variant_id,-p_delivered_qty,'sale',
        'Entrega do pedido '||left(p_order_id::text,8)
      );
    end if;

    v_delivered_total := v_item.delivered_qty+p_delivered_qty;
    v_item_status := case when v_delivered_total=v_item.qty then 'delivered' else 'partially_delivered' end;
    update public.appointment_product_order_items
    set delivered_qty=v_delivered_total,status=v_item_status::public.shop_order_item_status
    where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id;

    if exists(select 1 from public.appointment_product_order_items i
      where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id and i.status<>'delivered') then
      if exists(select 1 from public.appointment_product_order_items i
        where i.order_id=p_order_id and i.barbershop_id=p_barbershop_id
          and i.status in ('partially_delivered','delivered')) then
        update public.appointment_product_orders set status='partially_delivered'
        where id=p_order_id and barbershop_id=p_barbershop_id and status='ready';
      end if;
    else
      update public.appointment_product_orders set status='delivered'
      where id=p_order_id and barbershop_id=p_barbershop_id and status in ('ready','partially_delivered');
    end if;

    v_response := jsonb_build_object('item_id',p_item_id,'requested_qty',p_delivered_qty,
      'delivered_qty_total',v_delivered_total,'item_status',v_item_status,
      'stock_decremented',coalesce(v_track_stock,false));
    insert into public.shop_order_operation_events(
      barbershop_id,order_id,actor_id,event_type,note,operation_key,metadata
    ) values(p_barbershop_id,p_order_id,v_actor,'partial_delivery',nullif(btrim(p_note),''),
      p_operation_key,v_response);
    return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,
      'status',v_item_status,'delivered_qty',v_delivered_total,'idempotent',false);
  end if;

  if v_order.status in ('cancelled','failed','delivered') then raise exception 'SHOP_ORDER_TERMINAL'; end if;
  v_target := case p_action
    when 'accept' then 'accepted'::public.shop_order_item_status
    when 'prepare' then 'preparing'::public.shop_order_item_status
    when 'ready' then 'ready'::public.shop_order_item_status
    when 'unavailable' then 'unavailable'::public.shop_order_item_status
    when 'cancel' then 'cancelled'::public.shop_order_item_status
  end;
  if p_action='accept' and v_item.status<>'requested' then raise exception 'SHOP_ITEM_INVALID_TRANSITION'; end if;
  if p_action='prepare' and v_item.status<>'accepted' then raise exception 'SHOP_ITEM_INVALID_TRANSITION'; end if;
  if p_action='ready' and v_item.status<>'preparing' then raise exception 'SHOP_ITEM_INVALID_TRANSITION'; end if;
  if p_action='unavailable' and v_item.status not in ('requested','accepted','preparing','ready') then raise exception 'SHOP_ITEM_INVALID_TRANSITION'; end if;
  if p_action='cancel' and v_item.status not in ('requested','accepted','preparing','ready') then raise exception 'SHOP_ITEM_INVALID_TRANSITION'; end if;

  if p_action in ('unavailable','cancel') then
    update public.inventory_reservations set status='released'
    where order_id=p_order_id and barbershop_id=p_barbershop_id
      and variant_id=v_item.variant_id and status='reserved';
  end if;
  update public.appointment_product_order_items set status=v_target
  where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id;

  if p_action='unavailable' then
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note,metadata)
    values(p_barbershop_id,p_order_id,v_actor,'item_unavailable',btrim(p_note),jsonb_build_object('item_id',p_item_id));
    update public.appointment_product_orders
    set status=case when status in ('received','accepted','preparing','ready') then 'needs_confirmation'::public.shop_order_status else status end,
        needs_confirmation_reason=btrim(p_note)
    where id=p_order_id and barbershop_id=p_barbershop_id;
  elsif p_action='cancel' then
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,from_status,to_status,note,metadata)
    values(p_barbershop_id,p_order_id,v_actor,'status_changed',v_item.status::text,v_target::text,btrim(p_note),jsonb_build_object('item_id',p_item_id));
  else
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,from_status,to_status,metadata)
    values(p_barbershop_id,p_order_id,v_actor,'status_changed',v_item.status::text,v_target::text,jsonb_build_object('item_id',p_item_id));
  end if;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,'status',v_target::text);
end;
$function$


CREATE OR REPLACE FUNCTION public.restore_shop_order_item_operation(p_barbershop_id uuid, p_order_id uuid, p_item_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_order public.appointment_product_orders%rowtype;
  v_item public.appointment_product_order_items%rowtype;
  v_track_stock boolean := false;
  v_remaining integer;
begin
  if v_actor is null or not (
    public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;
  if p_note is not null and length(btrim(p_note))>1000 then raise exception 'SHOP_ORDER_NOTE_TOO_LONG'; end if;

  select * into v_order from public.appointment_product_orders
  where id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  select * into v_item from public.appointment_product_order_items
  where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_ITEM_NOT_FOUND' using errcode='P0002'; end if;

  if v_item.status='accepted' then
    return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,'status','accepted','idempotent',true);
  end if;
  if v_order.status not in ('accepted','preparing','partially_delivered') then raise exception 'SHOP_ORDER_MUST_BE_ACTIVE_TO_RESTORE_ITEM'; end if;
  if v_item.status<>'unavailable' then raise exception 'SHOP_ITEM_NOT_UNAVAILABLE'; end if;
  v_remaining := v_item.qty-v_item.delivered_qty;
  if v_remaining<1 then raise exception 'SHOP_ITEM_HAS_NO_REMAINING_QUANTITY'; end if;

  select p.track_stock into v_track_stock
  from public.shop_product_variants v
  join public.shop_products p on p.id=v.product_id and p.barbershop_id=v.barbershop_id
  where v.id=v_item.variant_id and v.barbershop_id=p_barbershop_id;
  if coalesce(v_track_stock,false) then
    insert into public.inventory_reservations(barbershop_id,order_id,variant_id,qty,status,expires_at)
    values(p_barbershop_id,p_order_id,v_item.variant_id,v_remaining,'reserved',null);
  end if;

  update public.appointment_product_order_items set status='accepted'
  where id=p_item_id and order_id=p_order_id and barbershop_id=p_barbershop_id;
  insert into public.shop_order_operation_events(
    barbershop_id,order_id,actor_id,event_type,from_status,to_status,note,metadata
  ) values(
    p_barbershop_id,p_order_id,v_actor,'status_changed','unavailable','accepted',
    nullif(btrim(p_note),''),jsonb_build_object('item_id',p_item_id,'reservation_recreated',coalesce(v_track_stock,false))
  );
  return jsonb_build_object('ok',true,'order_id',p_order_id,'item_id',p_item_id,'status','accepted','idempotent',false);
end;
$function$


revoke all on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text,uuid) from public, anon;
grant execute on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text,uuid) to authenticated;
revoke all on function public.restore_shop_order_item_operation(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.restore_shop_order_item_operation(uuid,uuid,uuid,text) to authenticated;
