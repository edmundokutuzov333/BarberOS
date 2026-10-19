-- BarberOS Phase 9: operational agenda engine.



CREATE OR REPLACE FUNCTION private.require_agenda_access(p_shop uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if private.is_platform_admin() then
    return;
  end if;

  if private.is_member(
    p_shop,
    array['owner','manager','barber']::public.app_role[]
  ) then
    return;
  end if;

  raise exception 'SHOP_OPERATOR_REQUIRED';
end;
$function$;
