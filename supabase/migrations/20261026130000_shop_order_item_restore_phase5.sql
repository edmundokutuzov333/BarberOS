-- BarberOS | Fase 5 | recuperar um artigo anteriormente marcado como indisponível.
-- Restauração explícita após a equipa confirmar a disponibilidade e o pedido ser aceite. 

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
      or (old.status='unavailable' and new.status in ('accepted','cancelled'))
    ) then
      raise exception 'INVALID_SHOP_ORDER_ITEM_TRANSITION: % -> %',old.status,new.status
        using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.restore_shop_order_item_operation(
  p_barbershop_id uuid,p_order_id uuid,p_item_id uuid,p_note text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
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
  if v_order.status<>'accepted' then raise exception 'SHOP_ORDER_MUST_BE_ACCEPTED_TO_RESTORE_ITEM'; end if;
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
$function$;

revoke all on function public.restore_shop_order_item_operation(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.restore_shop_order_item_operation(uuid,uuid,uuid,text) to authenticated;

