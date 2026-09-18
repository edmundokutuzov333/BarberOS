drop function if exists public.get_appointment_by_token(uuid);
create function public.get_appointment_by_token(p_token uuid)
returns table(
  shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, shop_address text, shop_maps_url text,
  timezone text, cancellation_rule public.cancellation_rule, customer_name text,
  appointment_starts_at timestamptz, appointment_ends_at timestamptz, appointment_status public.appointment_status,
  deposit_status public.deposit_state, deposit_cents int, service_name text, service_price_cents int,
  service_duration_min int, haircut_name text, barber_name text, barber_photo_url text,
  can_cancel boolean, can_reschedule boolean, action_deadline timestamptz
)
language sql security definer set search_path=''
as $fn$
  select * from public.get_appointment_by_token(p_token);
$fn$;
