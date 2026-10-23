-- BarberOS | Fase 4 | libertação das reservas quando um pedido é cancelado.
-- Forward-only repair: appointment lifecycle already cancels the linked order,
-- but cancellation must also release its reserved inventory in the same transaction.
create or replace function private.shop_order_release_reservations_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.inventory_reservations
    set status = 'released'
    where order_id = new.id
      and barbershop_id = new.barbershop_id
      and status = 'reserved';
  end if;
  return new;
end;
$function$;

drop trigger if exists shop_order_release_reservations_on_cancel on public.appointment_product_orders;
create trigger shop_order_release_reservations_on_cancel
after update of status on public.appointment_product_orders
for each row execute function private.shop_order_release_reservations_on_cancel();

revoke all on function private.shop_order_release_reservations_on_cancel() from public, anon, authenticated;
