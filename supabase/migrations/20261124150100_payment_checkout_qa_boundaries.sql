-- Fail closed when the simulator is switched off, and prevent external messages from QA checkout shops.
create function private.payment_checkout_hold_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deposit_status='awaiting' and new.deposit_cents>0 and not private.payments_available()
 and exists(select 1 from private.payment_checkout_test_shops x where x.shop_id=new.barbershop_id)
 and not private.payment_checkout_allowed(new.barbershop_id) then raise exception 'PAYMENTS_UNAVAILABLE'; end if;
 return new;
end $$;
revoke all on function private.payment_checkout_hold_guard() from public,anon,authenticated;
create trigger payment_checkout_hold_guard before insert on public.appointments for each row execute function private.payment_checkout_hold_guard();
create function private.payment_checkout_no_external_notifications() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.payment_checkout_test_shops x where x.shop_id=new.barbershop_id) then return null; end if;
 return new;
end $$;
revoke all on function private.payment_checkout_no_external_notifications() from public,anon,authenticated;
create trigger payment_checkout_no_external_notifications before insert on public.notifications for each row execute function private.payment_checkout_no_external_notifications();
