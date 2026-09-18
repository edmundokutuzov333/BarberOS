-- BarberOS Phase 9: validate agenda ranges before operator authorization.
-- This is intentionally additive/replacement only.

create or replace function public.get_agenda_appointments(
  p_shop uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  appointment_id uuid, barber_id uuid, barber_name text, barber_photo_url text,
  customer_name text, customer_phone text, customer_email text,
  service_id uuid, service_name text, haircut_id uuid, haircut_name text,
  starts_at timestamptz, ends_at timestamptz, duration_min int, price_cents int,
  status public.appointment_status, deposit_status public.deposit_state, deposit_cents int,
  hold_expires_at timestamptz, source public.booking_source, manage_token uuid
)
language plpgsql security definer stable set search_path=''
as $fn$
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to - p_from > interval '14 days' then raise exception 'AGENDA_RANGE_TOO_LARGE'; end if;
  perform private.require_agenda_access(p_shop);

  return query
  select a.id,b.id,b.display_name,b.photo_url,c.name,c.phone,c.email,
         a.service_id,s.name,a.haircut_id,h.name,a.starts_at,a.ends_at,a.duration_min,
         a.price_cents,a.status,a.deposit_status,a.deposit_cents,a.hold_expires_at,
         a.source,a.manage_token
  from public.appointments a
  join public.barbers b on b.id=a.barber_id and b.barbershop_id=a.barbershop_id
  join public.customers c on c.id=a.customer_id and c.barbershop_id=a.barbershop_id
  join public.services s on s.id=a.service_id and s.barbershop_id=a.barbershop_id
  left join public.haircuts h on h.id=a.haircut_id and h.barbershop_id=a.barbershop_id
  where a.barbershop_id=p_shop
    and a.starts_at>=p_from
    and a.starts_at<p_to
    and (
      private.is_platform_admin()
      or private.is_member(p_shop,array['owner','manager']::public.app_role[])
      or (private.is_member(p_shop,array['barber']::public.app_role[]) and a.barber_id=private.my_barber_id(p_shop))
    )
  order by a.starts_at,b.sort_order,c.name;
end;
$fn$;

create or replace function public.get_agenda_schedule(
  p_shop uuid,
  p_from date,
  p_to date
)
returns table(
  schedule_date date, barber_id uuid, barber_name text,
  opens_at time, closes_at time, is_closed boolean
)
language plpgsql security definer stable set search_path=''
as $fn$
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 14 then raise exception 'AGENDA_RANGE_TOO_LARGE'; end if;
  perform private.require_agenda_access(p_shop);

  return query
  with days as (
    select generate_series(p_from,p_to,interval '1 day')::date as day
  ),
  active_barbers as (
    select b.id,b.display_name,b.sort_order
    from public.barbers b
    where b.barbershop_id=p_shop and b.is_active
      and (
        private.is_platform_admin()
        or private.is_member(p_shop,array['owner','manager']::public.app_role[])
        or (private.is_member(p_shop,array['barber']::public.app_role[]) and b.id=private.my_barber_id(p_shop))
      )
  )
  select d.day,b.id,b.display_name,
    coalesce(ov.opens_at,case when wh.is_closed then null else wh.opens_at end),
    coalesce(ov.closes_at,case when wh.is_closed then null else wh.closes_at end),
    case when ov.id is not null then ov.is_closed when wh.id is null then true else wh.is_closed end
  from days d
  cross join active_barbers b
  left join lateral (
    select o.id,o.is_closed,o.opens_at,o.closes_at
    from public.schedule_overrides o
    where o.barbershop_id=p_shop and o.override_date=d.day and (o.barber_id=b.id or o.barber_id is null)
    order by case when o.barber_id=b.id then 0 else 1 end
    limit 1
  ) ov on true
  left join lateral (
    select wh.id,wh.opens_at,wh.closes_at,wh.is_closed
    from public.working_hours wh
    where wh.barbershop_id=p_shop and wh.weekday=extract(dow from d.day)::int and (wh.barber_id=b.id or wh.barber_id is null)
    order by case when wh.barber_id=b.id then 0 else 1 end
    limit 1
  ) wh on true
  order by d.day,b.sort_order,b.display_name;
end;
$fn$;

revoke all on function public.get_agenda_appointments(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_agenda_appointments(uuid,timestamptz,timestamptz) to authenticated;
revoke all on function public.get_agenda_schedule(uuid,date,date) from public,anon,authenticated;
grant execute on function public.get_agenda_schedule(uuid,date,date) to authenticated;
