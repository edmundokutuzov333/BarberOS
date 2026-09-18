-- BarberOS Phase 13: Waitlist operational read models.

create or replace function public.get_waitlist(
  p_shop uuid,
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  waitlist_entry_id uuid,
  queue_position bigint,
  customer_name text,
  phone text,
  email text,
  service_name text,
  haircut_name text,
  barber_name text,
  date_from date,
  date_to date,
  period text,
  status public.waitlist_status,
  offer_slot_start timestamptz,
  offer_barber_name text,
  offer_expires_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text := lower(btrim(coalesce(p_status,'active')));
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
begin
  perform private.require_shop_operator(p_shop);

  if v_status not in ('active','waiting','offered','converted','expired','cancelled','all') then
    raise exception 'WAITLIST_STATUS_INVALID';
  end if;

  return query
  with base as (
    select
      w.*,
      count(*) filter (where w.status='waiting') over (
        partition by w.service_id
        order by w.created_at,w.id
        rows between unbounded preceding and current row
      ) as waiting_position
    from public.waitlist_entries w
    where w.barbershop_id=p_shop
      and (
        v_status='all'
        or (v_status='active' and w.status in ('waiting','offered'))
        or v_status=w.status::text
      )
      and (
        v_search is null
        or w.customer_name ilike '%' || v_search || '%'
        or w.phone ilike '%' || v_search || '%'
        or coalesce(w.email,'') ilike '%' || v_search || '%'
      )
  )
  select
    b0.id,
    case when b0.status='waiting' then b0.waiting_position else null end,
    b0.customer_name,
    b0.phone,
    b0.email,
    s.name,
    h.name,
    pb.display_name,
    b0.date_from,
    b0.date_to,
    b0.period,
    b0.status,
    b0.offer_slot_start,
    ob.display_name,
    b0.offer_expires_at,
    b0.created_at,
    count(*) over()::bigint
  from base b0
  join public.services s on s.id=b0.service_id
  left join public.haircuts h on h.id=b0.haircut_id
  left join public.barbers pb on pb.id=b0.barber_id
  left join public.barbers ob on ob.id=b0.offer_barber_id
  order by
    case b0.status when 'offered' then 0 when 'waiting' then 1 else 2 end,
    b0.created_at,
    b0.id
  limit v_limit
  offset v_offset;
end;
$function$;

create or replace function public.get_waitlist_metrics(
  p_shop uuid
)
returns table(
  waiting_count bigint,
  offered_count bigint,
  expiring_soon_count bigint,
  converted_30d bigint
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_shop_operator(p_shop);

  return query
  select
    count(*) filter (where w.status='waiting')::bigint,
    count(*) filter (where w.status='offered' and w.offer_expires_at > now())::bigint,
    count(*) filter (
      where w.status='offered'
        and w.offer_expires_at > now()
        and w.offer_expires_at <= now()+interval '5 minutes'
    )::bigint,
    count(*) filter (
      where w.status='converted'
        and w.created_at >= now()-interval '30 days'
    )::bigint
  from public.waitlist_entries w
  where w.barbershop_id=p_shop;
end;
$function$;

create or replace function public.get_waitlist_offer(
  p_token uuid
)
returns table(
  status public.waitlist_status,
  can_claim boolean,
  customer_name text,
  service_name text,
  service_price_cents integer,
  service_duration_min integer,
  haircut_name text,
  barber_name text,
  slot_start timestamptz,
  offer_expires_at timestamptz,
  shop_name text,
  shop_slug text,
  shop_phone text,
  shop_whatsapp text,
  timezone text
)
language sql
security definer
set search_path=''
as $function$
  select
    w.status,
    (w.status='offered' and w.offer_expires_at > now()) as can_claim,
    w.customer_name,
    s.name,
    s.price_cents,
    s.duration_min,
    h.name,
    b.display_name,
    w.offer_slot_start,
    w.offer_expires_at,
    sh.name,
    sh.slug,
    sh.phone,
    sh.whatsapp,
    sh.timezone
  from public.waitlist_entries w
  join public.barbershops sh on sh.id=w.barbershop_id
  join public.services s on s.id=w.service_id
  left join public.haircuts h on h.id=w.haircut_id
  left join public.barbers b on b.id=w.offer_barber_id
  where w.offer_token=p_token
    and w.status in ('offered','converted','expired','cancelled')
  limit 1;
$function$;

revoke all on function public.get_waitlist(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_waitlist(uuid,text,text,integer,integer) to authenticated;

revoke all on function public.get_waitlist_metrics(uuid) from public,anon,authenticated;
grant execute on function public.get_waitlist_metrics(uuid) to authenticated;

revoke all on function public.get_waitlist_offer(uuid) from public,authenticated;
grant execute on function public.get_waitlist_offer(uuid) to anon;
