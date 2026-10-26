-- BarberOS | Fase 5 | integridade operacional, idempotência e índices.
-- Forward-only. Aplicar apenas depois da cadeia de migrations reconciliada. 

alter table public.shop_order_operation_events
  add column if not exists operation_key uuid;

alter table public.shop_order_operation_events
  drop constraint if exists shop_order_operation_events_event_type_check;
alter table public.shop_order_operation_events
  add constraint shop_order_operation_events_event_type_check
  check (event_type in ('status_changed','note_added','item_unavailable','partial_delivery','assigned'));

create unique index if not exists shop_order_operation_events_idempotency_idx
  on public.shop_order_operation_events(barbershop_id, order_id, operation_key)
  where operation_key is not null;
create index if not exists shop_order_operation_events_order_id_idx
  on public.shop_order_operation_events(order_id);
create index if not exists shop_order_operation_events_actor_id_idx
  on public.shop_order_operation_events(actor_id)
  where actor_id is not null;
create index if not exists appointment_product_orders_assigned_to_idx
  on public.appointment_product_orders(assigned_to)
  where assigned_to is not null;

create or replace function private.shop_order_status_guard()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_actor uuid := auth.uid();
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status='received' and new.status in ('needs_confirmation','accepted','cancelled','failed'))
      or (old.status='needs_confirmation' and new.status in ('received','accepted','cancelled','failed'))
      or (old.status='accepted' and new.status in ('needs_confirmation','preparing','cancelled','failed'))
      or (old.status='preparing' and new.status in ('needs_confirmation','ready','partially_delivered','cancelled','failed'))
      or (old.status='ready' and new.status in ('needs_confirmation','partially_delivered','delivered','cancelled','failed'))
      or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
    ) then
      raise exception 'INVALID_SHOP_ORDER_TRANSITION: % -> %', old.status, new.status using errcode='check_violation';
    end if;
    if new.status in ('accepted','preparing','ready','partially_delivered','delivered') and not exists (
      select 1 from public.appointment_product_order_items i
      where i.order_id=new.id and i.barbershop_id=new.barbershop_id
    ) then raise exception 'SHOP_ORDER_EMPTY'; end if;
    if new.status='ready' and exists (
      select 1 from public.appointment_product_order_items i
      where i.order_id=new.id and i.barbershop_id=new.barbershop_id
        and i.status not in ('ready','delivered')
    ) then raise exception 'SHOP_ORDER_ITEMS_NOT_READY'; end if;
    if new.status='partially_delivered' and not exists (
      select 1 from public.appointment_product_order_items i
      where i.order_id=new.id and i.barbershop_id=new.barbershop_id
        and i.status in ('partially_delivered','delivered')
    ) then raise exception 'SHOP_ORDER_HAS_NO_DELIVERED_ITEMS'; end if;
    if new.status='delivered' and exists (
      select 1 from public.appointment_product_order_items i
      where i.order_id=new.id and i.barbershop_id=new.barbershop_id
        and i.status <> 'delivered'
    ) then raise exception 'SHOP_ORDER_ITEMS_NOT_DELIVERED'; end if;
    if new.status='accepted' then
      new.accepted_at := coalesce(new.accepted_at, now());
      new.accepted_by := coalesce(new.accepted_by, v_actor);
    elsif new.status='ready' then
      new.ready_at := coalesce(new.ready_at, now());
      new.ready_by := coalesce(new.ready_by, v_actor);
    elsif new.status='delivered' then
      new.delivered_at := coalesce(new.delivered_at, now());
      new.delivered_by := coalesce(new.delivered_by, v_actor);
    elsif new.status='cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
      new.cancelled_by := coalesce(new.cancelled_by, v_actor);
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.shop_order_item_status_guard()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  new.updated_at := now();
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status='requested' and new.status in ('accepted','unavailable','cancelled'))
      or (old.status='accepted' and new.status in ('preparing','ready','unavailable','cancelled','failed'))
      or (old.status='preparing' and new.status in ('ready','partially_delivered','unavailable','cancelled','failed'))
      or (old.status='ready' and new.status in ('partially_delivered','delivered','unavailable','cancelled','failed'))
      or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
    ) then
      raise exception 'INVALID_SHOP_ORDER_ITEM_TRANSITION: % -> %', old.status, new.status using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.shop_order_release_reservations_on_cancel()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.status in ('cancelled','failed') and old.status is distinct from new.status then
    update public.inventory_reservations
    set status='released'
    where order_id=new.id and barbershop_id=new.barbershop_id and status='reserved';
  end if;
  return new;
end;
$function$;

create or replace function public.update_shop_order_operation(
  p_barbershop_id uuid,p_order_id uuid,p_action text,p_note text default null,p_assigned_to uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_order public.appointment_product_orders%rowtype;
  v_actor uuid := auth.uid();
  v_target public.shop_order_status;
  v_allowed boolean := false;
begin
  if v_actor is null or not (
    public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501'; end if;
  if p_action not in ('accept','needs_confirmation','prepare','ready','cancel','fail','assign','note') then
    raise exception 'INVALID_SHOP_ORDER_ACTION';
  end if;
  if p_note is not null and length(btrim(p_note))>1000 then raise exception 'SHOP_ORDER_NOTE_TOO_LONG'; end if;

  select * into v_order from public.appointment_product_orders
  where id=p_order_id and barbershop_id=p_barbershop_id for update;
  if not found then raise exception 'SHOP_ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if p_action='assign' then
    if p_assigned_to is not null and not exists (
      select 1 from public.barbershop_members m
      where m.barbershop_id=p_barbershop_id and m.user_id=p_assigned_to
    ) then raise exception 'SHOP_ORDER_ASSIGNEE_NOT_MEMBER'; end if;
    if v_order.assigned_to is not distinct from p_assigned_to then
      return jsonb_build_object('ok',true,'order_id',p_order_id,'action',p_action,'idempotent',true);
    end if;
    update public.appointment_product_orders set assigned_to=p_assigned_to
    where id=p_order_id and barbershop_id=p_barbershop_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note,metadata)
    values(p_barbershop_id,p_order_id,v_actor,'assigned',nullif(btrim(p_note),''),
      jsonb_build_object('assigned_to',p_assigned_to));
  elsif p_action='note' then
    if v_order.internal_note is not distinct from nullif(btrim(p_note),'') then
      return jsonb_build_object('ok',true,'order_id',p_order_id,'action',p_action,'idempotent',true);
    end if;
    update public.appointment_product_orders set internal_note=nullif(btrim(p_note),'')
    where id=p_order_id and barbershop_id=p_barbershop_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,note)
    values(p_barbershop_id,p_order_id,v_actor,'note_added',nullif(btrim(p_note),''));
  else
    v_target := case p_action
      when 'accept' then 'accepted'::public.shop_order_status
      when 'needs_confirmation' then 'needs_confirmation'::public.shop_order_status
      when 'prepare' then 'preparing'::public.shop_order_status
      when 'ready' then 'ready'::public.shop_order_status
      when 'cancel' then 'cancelled'::public.shop_order_status
      when 'fail' then 'failed'::public.shop_order_status
    end;
    if p_action='needs_confirmation' and coalesce(length(btrim(p_note)),0)=0 then raise exception 'SHOP_ORDER_REASON_REQUIRED'; end if;
    if p_action='cancel' and coalesce(length(btrim(p_note)),0)=0 then raise exception 'SHOP_ORDER_CANCELLATION_REASON_REQUIRED'; end if;
    if v_order.status=v_target then
      return jsonb_build_object('ok',true,'order_id',p_order_id,'action',p_action,'idempotent',true);
    end if;
    v_allowed := case p_action
      when 'accept' then v_order.status in ('received','needs_confirmation')
      when 'needs_confirmation' then v_order.status in ('received','accepted','preparing','ready')
      when 'prepare' then v_order.status='accepted'
      when 'ready' then v_order.status='preparing'
      when 'cancel' then v_order.status in ('received','needs_confirmation','accepted','preparing','ready','partially_delivered')
      when 'fail' then v_order.status in ('received','needs_confirmation','accepted','preparing','ready','partially_delivered')
      else false
    end;
    if not v_allowed then raise exception 'SHOP_ORDER_INVALID_TRANSITION: % -> %',v_order.status,v_target; end if;
    update public.appointment_product_orders
    set status=v_target,
        needs_confirmation_reason=case when p_action='needs_confirmation' then btrim(p_note) else needs_confirmation_reason end,
        cancellation_reason=case when p_action='cancel' then btrim(p_note) else cancellation_reason end
    where id=p_order_id and barbershop_id=p_barbershop_id;
    insert into public.shop_order_operation_events(barbershop_id,order_id,actor_id,event_type,from_status,to_status,note)
    values(p_barbershop_id,p_order_id,v_actor,'status_changed',v_order.status::text,v_target::text,nullif(btrim(p_note),''));
  end if;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'action',p_action);
end;
$function$;
revoke all on function public.update_shop_order_operation(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.update_shop_order_operation(uuid,uuid,text,text,uuid) to authenticated;

drop function if exists public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text);
create or replace function public.update_shop_order_item_operation(
  p_barbershop_id uuid,p_order_id uuid,p_item_id uuid,p_action text,
  p_delivered_qty integer default null,p_note text default null,p_operation_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
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
$function$;
revoke all on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.update_shop_order_item_operation(uuid,uuid,uuid,text,integer,text,uuid) to authenticated;

