-- Fase 1 hardening: parent order status must reflect its item lines.
create or replace function private.shop_order_status_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid();
begin
 new.updated_at:=now();
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if not (
   (old.status='received' and new.status in ('needs_confirmation','accepted','cancelled','failed'))
   or (old.status='needs_confirmation' and new.status in ('received','accepted','cancelled','failed'))
   or (old.status='accepted' and new.status in ('needs_confirmation','preparing','cancelled','failed'))
   or (old.status='preparing' and new.status in ('ready','partially_delivered','cancelled','failed'))
   or (old.status='ready' and new.status in ('partially_delivered','delivered','cancelled','failed'))
   or (old.status='partially_delivered' and new.status in ('delivered','cancelled','failed'))
  ) then
   raise exception 'INVALID_SHOP_ORDER_TRANSITION: % -> %',old.status,new.status using errcode='check_violation';
  end if;

  if new.status in ('accepted','preparing','ready','partially_delivered','delivered') and not exists(
   select 1 from public.appointment_product_order_items i
   where i.order_id=new.id and i.barbershop_id=new.barbershop_id
  ) then
   raise exception 'SHOP_ORDER_EMPTY';
  end if;

  if new.status='ready' and exists(
   select 1 from public.appointment_product_order_items i
   where i.order_id=new.id and i.barbershop_id=new.barbershop_id
     and i.status not in ('ready','delivered')
  ) then
   raise exception 'SHOP_ORDER_ITEMS_NOT_READY';
  end if;

  if new.status='partially_delivered' and not exists(
   select 1 from public.appointment_product_order_items i
   where i.order_id=new.id and i.barbershop_id=new.barbershop_id
     and i.status in ('partially_delivered','delivered')
  ) then
   raise exception 'SHOP_ORDER_HAS_NO_DELIVERED_ITEMS';
  end if;

  if new.status='delivered' and exists(
   select 1 from public.appointment_product_order_items i
   where i.order_id=new.id and i.barbershop_id=new.barbershop_id
     and i.status <> 'delivered'
  ) then
   raise exception 'SHOP_ORDER_ITEMS_NOT_DELIVERED';
  end if;

  if new.status='accepted' then new.accepted_at:=coalesce(new.accepted_at,now()); new.accepted_by:=coalesce(new.accepted_by,v_actor);
  elsif new.status='ready' then new.ready_at:=coalesce(new.ready_at,now()); new.ready_by:=coalesce(new.ready_by,v_actor);
  elsif new.status='delivered' then new.delivered_at:=coalesce(new.delivered_at,now()); new.delivered_by:=coalesce(new.delivered_by,v_actor);
  elsif new.status='cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,now()); new.cancelled_by:=coalesce(new.cancelled_by,v_actor);
  end if;
 end if;
 return new;
end; $$;
