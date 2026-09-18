drop function if exists public.get_appointment_by_token(uuid);

create function public.get_appointment_by_token(
  p_token uuid
)
returns table(
  shop_name text,
  shop_slug text,
  shop_phone text,
  shop_whatsapp text,
  shop_address text,
  shop_maps_url text,
  timezone text,
  cancellation_rule public.cancellation_rule,
  customer_name text,
  appointment_starts_at timestamptz,
  appointment_ends_at timestamptz,
  appointment_status public.appointment_status,
  deposit_status public.deposit_state,
  deposit_cents int,
  service_name text,
  service_price_cents int,
  service_duration_min int,
  haircut_name text,
  barber_name text,
  barber_photo_url text,
  can_cancel boolean,
  can_reschedule boolean,
  action_deadline timestamptz
)
language sql
security definer
set search_path=''
as $fn$
  select
    sh.name,
    sh.slug,
    sh.phone,
    sh.whatsapp,
    sh.address,
    sh.maps_url,
    sh.timezone,
    sh.cancellation_rule,
    c.name,
    a.starts_at,
    a.ends_at,
    a.status,
    a.deposit_status,
    a.deposit_cents,
    s.name,
    s.price_cents,
    s.duration_min,
    h.name,
    b.display_name,
    b.photo_url,
    (
      a.status in ('pending','confirmed')
      and a.starts_at > now()
      and sh.cancellation_rule <> 'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now() <= a.starts_at - interval '2 hours'
        when 'moderate_6h' then now() <= a.starts_at - interval '6 hours'
        when 'strict_24h' then now() <= a.starts_at - interval '24 hours'
        else false
      end
    ),
    (
      a.status in ('pending','confirmed')
      and a.starts_at > now()
      and (a.deposit_status <> 'awaiting' or a.hold_expires_at is null or a.hold_expires_at > now())
      and sh.cancellation_rule <> 'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now() <= a.starts_at - interval '2 hours'
        when 'moderate_6h' then now() <= a.starts_at - interval '6 hours'
        when 'strict_24h' then now() <= a.starts_at - interval '24 hours'
        else false
      end
    ),
    case sh.cancellation_rule
      when 'flex_2h' then a.starts_at - interval '2 hours'
      when 'moderate_6h' then a.starts_at - interval '6 hours'
      when 'strict_24h' then a.starts_at - interval '24 hours'
      else null
    end
  from public.appointments a
  join public.barbershops sh on sh.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services s on s.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  where a.manage_token=p_token;
$fn$;

revoke all on function public.get_appointment_by_token(uuid) from public,anon,authenticated;
grant execute on function public.get_appointment_by_token(uuid) to anon,authenticated;
