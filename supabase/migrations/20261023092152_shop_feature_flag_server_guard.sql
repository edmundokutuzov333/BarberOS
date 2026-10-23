-- Keep the shop rollout flag under server control even when legacy table-wide
-- UPDATE/INSERT grants exist on public.barbershops.
create or replace function private.shop_feature_flag_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' and coalesce(new.shop_enabled, false) then
      raise exception 'SHOP_FEATURE_FLAG_SERVER_MANAGED';
    end if;
    if tg_op = 'UPDATE' and new.shop_enabled is distinct from old.shop_enabled then
      raise exception 'SHOP_FEATURE_FLAG_SERVER_MANAGED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists barbershops_shop_feature_flag_guard on public.barbershops;
create trigger barbershops_shop_feature_flag_guard
before insert or update of shop_enabled on public.barbershops
for each row execute function private.shop_feature_flag_guard();

revoke all on function private.shop_feature_flag_guard() from public, anon, authenticated;
