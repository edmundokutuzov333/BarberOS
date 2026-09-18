-- BarberOS Phase 11: return operational booking details to the counter UI.
drop function if exists public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text);

create function public.book_appointment_manual(
  p_shop uuid,
  p_service_id uuid,
  p_haircut_id uuid,
  p_barber_id uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_email text default null,
  p_internal_note text default null
)
returns table(
  appointment_id uuid,
  manage_token uuid,
  barber_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  deposit_cents int,
  needs_payment boolean
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_slug text;
  v_my_barber uuid;
  v_is_barber boolean;
  v_result record;
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  perform private.require_agenda_access(p_shop);

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_my_barber := private.my_barber_id(p_shop);

    if v_my_barber is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;

    if p_barber_id is null or p_barber_id <> v_my_barber then
      raise exception 'BARBER_SCOPE_VIOLATION';
    end if;
  end if;

  select b.slug into v_slug
  from public.barbershops b
  where b.id=p_shop;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select * into v_result
  from private.book_appointment_core(
    v_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email,
    'manual'::public.booking_source,
    auth.uid(),
    p_internal_note
  );

  return query
  select
    v_result.appointment_id,
    v_result.manage_token,
    a.barber_id,
    a.starts_at,
    a.ends_at,
    a.status,
    v_result.deposit_cents,
    v_result.needs_payment
  from public.appointments a
  where a.id=v_result.appointment_id
    and a.barbershop_id=p_shop;
end;
$function$;

revoke all on function public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)
  to authenticated;
