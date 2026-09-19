create or replace function public.get_appointments(
  p_shop uuid,
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_status public.appointment_status default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  appointment_id uuid,
  barber_id uuid,
  barber_name text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  service_id uuid,
  service_name text,
  haircut_id uuid,
  haircut_name text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  duration_min integer,
  price_cents integer,
  status public.appointment_status,
  deposit_status public.deposit_state,
  deposit_cents integer,
  hold_expires_at timestamp with time zone,
  source public.booking_source,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if p_to - p_from > interval '90 days' then
    raise exception 'AGENDA_RANGE_TOO_LARGE';
  end if;

  if v_limit < 1 or v_limit > 100 then
    raise exception 'INVALID_LIMIT';
  end if;

  perform private.require_agenda_access(p_shop);

  return query
  select
    a.id,
    b.id,
    b.display_name,
    c.id,
    c.name,
    c.phone,
    c.email,
    a.service_id,
    s.name,
    a.haircut_id,
    h.name,
    a.starts_at,
    a.ends_at,
    a.duration_min,
    a.price_cents,
    a.status,
    a.deposit_status,
    a.deposit_cents,
    a.hold_expires_at,
    a.source,
    count(*) over()
  from public.appointments a
  join public.barbers b
    on b.id = a.barber_id
   and b.barbershop_id = a.barbershop_id
  join public.customers c
    on c.id = a.customer_id
   and c.barbershop_id = a.barbershop_id
  join public.services s
    on s.id = a.service_id
   and s.barbershop_id = a.barbershop_id
  left join public.haircuts h
    on h.id = a.haircut_id
   and h.barbershop_id = a.barbershop_id
  where a.barbershop_id = p_shop
    and a.starts_at >= p_from
    and a.starts_at < p_to
    and (p_status is null or a.status = p_status)
    and (
      v_search is null
      or c.name ilike '%' || v_search || '%'
      or c.phone ilike '%' || v_search || '%'
      or coalesce(c.email, '') ilike '%' || v_search || '%'
      or s.name ilike '%' || v_search || '%'
      or b.display_name ilike '%' || v_search || '%'
    )
    and (
      private.is_platform_admin()
      or private.is_member(p_shop, array['owner','manager']::public.app_role[])
      or (
        private.is_member(p_shop, array['barber']::public.app_role[])
        and a.barber_id = private.my_barber_id(p_shop)
      )
    )
  order by a.starts_at desc, b.sort_order, c.name
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.get_appointments(uuid,timestamptz,timestamptz,public.appointment_status,text,integer,integer) from public;
grant execute on function public.get_appointments(uuid,timestamptz,timestamptz,public.appointment_status,text,integer,integer) to authenticated;