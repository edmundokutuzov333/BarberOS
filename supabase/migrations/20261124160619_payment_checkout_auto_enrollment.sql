-- Opt-in automatic enrollment for isolated QA environments only.
-- Defaults to false; does not enable commercial payments or modify deposit settings.
alter table private.payment_simulator_settings
 add column if not exists auto_enroll_shops boolean not null default false;

create or replace function private.payment_checkout_auto_enroll_new_shop()
returns trigger language plpgsql security definer set search_path='' as $$
declare auto_enroll boolean;
begin
 select s.auto_enroll_shops into auto_enroll
 from private.payment_simulator_settings s where s.singleton for share;
 if coalesce(auto_enroll,false) and not private.payments_available() then
  insert into private.payment_checkout_test_shops(shop_id)
  values(new.id) on conflict(shop_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.payment_checkout_auto_enroll_new_shop() from public,anon,authenticated;
create trigger payment_checkout_auto_enroll_new_shop
 after insert on public.barbershops for each row
 execute function private.payment_checkout_auto_enroll_new_shop();

create or replace function private.payment_checkout_auto_enroll_existing_shops()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.auto_enroll_shops then
  if private.payments_available() then
   raise exception 'SIM_AUTO_ENROLL_LIVE_PAYMENTS_FORBIDDEN';
  end if;
  insert into private.payment_checkout_test_shops(shop_id)
  select id from public.barbershops on conflict(shop_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.payment_checkout_auto_enroll_existing_shops() from public,anon,authenticated;
create trigger payment_checkout_auto_enroll_existing_shops
 after update of auto_enroll_shops on private.payment_simulator_settings
 for each row execute function private.payment_checkout_auto_enroll_existing_shops();
