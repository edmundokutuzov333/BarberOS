-- Commercial styles require explicit service compatibility; unlinked styles are gallery-only.
-- Existing appointment snapshots are immutable. Online and manual use one duration-aware engine.
create or replace function private.resolve_booking_offer(p_shop uuid,p_service uuid,p_haircut uuid)
returns table(price_cents integer,duration_min integer)
language plpgsql stable security definer set search_path='' as $$
declare s public.services%rowtype; h public.haircuts%rowtype;
begin
  select * into s from public.services where id=p_service and barbershop_id=p_shop and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  if p_haircut is not null then
    select * into h from public.haircuts where id=p_haircut and barbershop_id=p_shop and service_id=p_service and is_active;
    if not found then raise exception 'HAIRCUT_NOT_FOUND'; end if;
  end if;
  price_cents := coalesce(h.price_cents,s.price_cents);
  duration_min := coalesce(h.duration_min,s.duration_min);
  if price_cents < 0 or duration_min not between 5 and 480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
  return next;
end;
$$;
revoke all on function private.resolve_booking_offer(uuid,uuid,uuid) from public,anon,authenticated;

-- Link the known starter catalog only where there is a unique compatible service,
-- never replace merchant links or invalidate historical bookings/waitlist entries.
create or replace function private.link_reference_haircuts(p_shop uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  with mapping(style,service) as (values
    ('low fade','degradê / fade'),('mid fade','degradê / fade'),('high fade','degradê / fade'),
    ('taper fade','degradê / fade'),('skin fade','degradê / fade'),('drop fade','degradê / fade'),
    ('burst fade','degradê / fade'),('buzz cut','corte clássico'),('crew cut','corte clássico'),
    ('caesar','corte clássico'),('french crop','corte clássico'),('pompadour','corte clássico'),
    ('quiff','corte clássico'),('slick back','corte clássico'),('afro shape-up','contorno / line-up'),
    ('waves','waves e escova'),('twists','manutenção de dreads e twists'),
    ('dreads retwist','manutenção de dreads e twists'),('corte à tesoura','corte à tesoura'),
    ('corte infantil','corte infantil'),('careca à navalha','raspagem à navalha')
  ), candidates as (
    select h.id haircut_id,(array_agg(s.id order by s.id))[1] service_id
    from public.haircuts h join mapping m on lower(btrim(h.name))=m.style
    join public.services s on s.barbershop_id=h.barbershop_id and s.is_active and lower(btrim(s.name))=m.service
    where h.service_id is null and (p_shop is null or h.barbershop_id=p_shop)
    group by h.id having count(*)=1
  )
  update public.haircuts h set service_id=c.service_id from candidates c
  where h.id=c.haircut_id and h.service_id is null
    and not exists(select 1 from public.appointments a where a.haircut_id=h.id and a.service_id<>c.service_id)
    and not exists(select 1 from public.waitlist_entries w where w.haircut_id=h.id and w.service_id<>c.service_id);
  get diagnostics n=row_count;
  return n;
end;
$$;
revoke all on function private.link_reference_haircuts(uuid) from public,anon,authenticated;
select private.link_reference_haircuts();

CREATE OR REPLACE FUNCTION private.available_slots_for_duration(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_duration_min integer, p_exclude_appointment uuid)
 RETURNS TABLE(slot_start timestamp with time zone, barber_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  v_dur int;
  v_step int;
  v_lead int;
  v_tz text;
  v_today date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_tz := v_shop.timezone;
  v_today := (now() at time zone v_tz)::date;

  if p_date is null then
    raise exception 'INVALID_DATE';
  end if;

  if p_date < v_today then
    return;
  end if;

  if p_date > v_today + v_shop.max_advance_days then
    return;
  end if;

  select s.duration_min into v_dur
  from public.services s
  where s.id=p_service_id
    and s.barbershop_id=v_shop.id
    and s.is_active;

  if not found or v_dur < 5 or v_dur > 480 then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  v_dur := coalesce(p_duration_min,v_dur);
  if v_dur not between 5 and 480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
  v_step := v_shop.slot_interval_min;
  v_lead := v_shop.min_lead_time_min;

  if v_step not in (5,10,15,20,30,60) then
    raise exception 'INVALID_SLOT_INTERVAL';
  end if;

  if p_barber_id is not null and not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=v_shop.id
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  return query
  with candidates as (
    select b.id
    from public.barbers b
    join public.barber_services bs
      on bs.barber_id=b.id
     and bs.service_id=p_service_id
    where b.barbershop_id=v_shop.id
      and b.is_active
      and (p_barber_id is null or b.id=p_barber_id)
  ),
  schedule_choice as (
    select
      c.id as barber_id,
      o.id as override_id,
      o.is_closed as override_closed,
      o.opens_at as override_opens_at,
      o.closes_at as override_closes_at,
      bw.opens_at as barber_opens_at,
      bw.closes_at as barber_closes_at,
      bw.is_closed as barber_closed,
      sw.opens_at as shop_opens_at,
      sw.closes_at as shop_closes_at,
      sw.is_closed as shop_closed
    from candidates c
    left join lateral (
      select so.*
      from public.schedule_overrides so
      where so.barbershop_id=v_shop.id
        and so.override_date=p_date
        and (so.barber_id=c.id or so.barber_id is null)
      order by (so.barber_id is not null) desc
      limit 1
    ) o on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id=c.id
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) bw on true
    left join lateral (
      select w.*
      from public.working_hours w
      where w.barbershop_id=v_shop.id
        and w.barber_id is null
        and w.weekday=extract(dow from p_date)::int
      limit 1
    ) sw on true
  ),
  effective_windows as (
    select
      barber_id,
      case
        when override_id is not null then
          case when override_closed then null::time else override_opens_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_opens_at end
        else
          case when shop_closed then null::time else shop_opens_at end
      end as opens_at,
      case
        when override_id is not null then
          case when override_closed then null::time else override_closes_at end
        when barber_opens_at is not null then
          case when barber_closed then null::time else barber_closes_at end
        else
          case when shop_closed then null::time else shop_closes_at end
      end as closes_at
    from schedule_choice
  ),
  valid_windows as (
    select
      barber_id,
      ((p_date::timestamp + opens_at) at time zone v_tz) as win_start,
      ((p_date::timestamp + closes_at) at time zone v_tz) as win_end
    from effective_windows
    where opens_at is not null
      and closes_at is not null
      and closes_at > opens_at
  ),
  grid as (
    select
      w.barber_id,
      gs as s,
      gs + make_interval(mins=>v_dur) as e
    from valid_windows w
    cross join lateral generate_series(
      w.win_start,
      w.win_end - make_interval(mins=>v_dur),
      make_interval(mins=>v_step)
    ) gs
  ),
  free_slots as (
    select g.barber_id,g.s
    from grid g
    where g.s >= now() + make_interval(mins=>v_lead)
      and g.s <= now() + make_interval(days=>v_shop.max_advance_days)
      and not exists (
        select 1
        from public.appointments a
        where a.barber_id=g.barber_id
          and a.id is distinct from p_exclude_appointment
          and (
            a.status in ('confirmed','in_progress')
            or (
              a.status='pending'
              and (a.hold_expires_at is null or a.hold_expires_at > now())
            )
          )
          and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.s,g.e,'[)')
      )
      and not exists (
        select 1
        from public.time_blocks tb
        where tb.barbershop_id=v_shop.id
          and (tb.barber_id is null or tb.barber_id=g.barber_id)
          and tb.ends_at > tb.starts_at
          and tstzrange(tb.starts_at,tb.ends_at,'[)') && tstzrange(g.s,g.e,'[)')
      )
  )
  select fs.s, array_agg(fs.barber_id order by fs.barber_id)
  from free_slots fs
  group by fs.s
  order by fs.s;
end
$function$;
revoke all on function private.available_slots_for_duration(text,uuid,uuid,date,integer,uuid) from public,anon,authenticated;

create or replace function public.get_available_slots(p_slug text,p_service_id uuid,p_barber_id uuid default null,p_date date default current_date)
returns table(slot_start timestamptz,barber_ids uuid[]) language sql stable security definer set search_path='' as $$
  select * from private.available_slots_for_duration(p_slug,p_service_id,p_barber_id,p_date,null,null)
$$;
create or replace function public.get_offer_available_slots(p_slug text,p_service_id uuid,p_barber_id uuid,p_date date,p_haircut_id uuid)
returns table(slot_start timestamptz,barber_ids uuid[]) language plpgsql stable security definer set search_path='' as $$
declare v_shop uuid; v_duration integer;
begin
  select id into v_shop from public.barbershops where slug=p_slug and status in ('active','trial');
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  select o.duration_min into v_duration from private.resolve_booking_offer(v_shop,p_service_id,p_haircut_id) o;
  return query select * from private.available_slots_for_duration(p_slug,p_service_id,p_barber_id,p_date,v_duration,null);
end;
$$;
revoke all on function public.get_offer_available_slots(text,uuid,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.get_offer_available_slots(text,uuid,uuid,date,uuid) to anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_offer_available_days(p_slug text, p_service_id uuid, p_barber_id uuid, p_from date, p_to date, p_haircut_id uuid)
 RETURNS TABLE(day date, slots_count integer, is_open boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  d date;
  v_today date;
  v_end date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_today := (now() at time zone v_shop.timezone)::date;

  if p_from is null then p_from := v_today; end if;
  if p_to is null then p_to := p_from + 13; end if;

  if p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  p_from := greatest(p_from,v_today);
  v_end := least(p_to,p_from+60,v_today+v_shop.max_advance_days);

  if v_end < p_from then
    return;
  end if;

  for d in
    select generate_series(p_from,v_end,interval '1 day')::date
  loop
    day := d;

    select count(*)::int into slots_count
    from public.get_offer_available_slots(p_slug,p_service_id,p_barber_id,d,p_haircut_id);

    select exists (
      with candidates as (
        select b.id
        from public.barbers b
        join public.barber_services bs
          on bs.barber_id=b.id
         and bs.service_id=p_service_id
        where b.barbershop_id=v_shop.id
          and b.is_active
          and (p_barber_id is null or b.id=p_barber_id)
      ),
      effective_windows as (
        select
          c.id as barber_id,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.opens_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.opens_at end
            else
              case when sw.is_closed then null::time else sw.opens_at end
          end as opens_at,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.closes_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.closes_at end
            else
              case when sw.is_closed then null::time else sw.closes_at end
          end as closes_at
        from candidates c
        left join lateral (
          select * from public.schedule_overrides so
          where so.barbershop_id=v_shop.id
            and so.override_date=d
            and (so.barber_id=c.id or so.barber_id is null)
          order by (so.barber_id is not null) desc
          limit 1
        ) so on true
        left join lateral (
          select * from public.working_hours bw
          where bw.barbershop_id=v_shop.id
            and bw.barber_id=c.id
            and bw.weekday=extract(dow from d)::int
          limit 1
        ) bw on true
        left join lateral (
          select * from public.working_hours sw
          where sw.barbershop_id=v_shop.id
            and sw.barber_id is null
            and sw.weekday=extract(dow from d)::int
          limit 1
        ) sw on true
      )
      select 1
      from effective_windows ew
      where ew.opens_at is not null
        and ew.closes_at is not null
        and ew.closes_at > ew.opens_at
      limit 1
    ) into is_open;

    return next;
  end loop;
end
$function$;
revoke all on function public.get_offer_available_days(text,uuid,uuid,date,date,uuid) from public,anon,authenticated;
grant execute on function public.get_offer_available_days(text,uuid,uuid,date,date,uuid) to anon,authenticated;
CREATE OR REPLACE FUNCTION private.book_appointment_core(p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_source public.booking_source, p_created_by uuid DEFAULT NULL::uuid, p_internal_note text DEFAULT NULL::text)
 RETURNS TABLE(appointment_id uuid, manage_token uuid, deposit_cents integer, needs_payment boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  v_svc public.services%rowtype;
  v_haircut public.haircuts%rowtype;
  v_barber uuid;
  v_end timestamptz;
  v_cust uuid;
  v_id uuid;
  v_tok uuid;
  v_dep int := 0;
  v_status public.appointment_status;
  v_dstate public.deposit_state;
  v_phone text;
  v_email text;
  v_slot_date date;
  v_requested_slot_exists boolean;
  v_note text;
begin
  if p_source is null then
    raise exception 'INVALID_BOOKING_SOURCE';
  end if;

  if p_start is null then
    raise exception 'INVALID_DATE';
  end if;

  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 120 then
    raise exception 'INVALID_NAME';
  end if;

  v_phone := regexp_replace(btrim(coalesce(p_phone,'')), '[[:space:]-]+', '', 'g');

  if v_phone like '+258%' then
    null;
  elsif v_phone like '258%' then
    v_phone := '+' || v_phone;
  elsif v_phone like '8%' then
    v_phone := '+258' || v_phone;
  else
    raise exception 'INVALID_PHONE';
  end if;

  if left(v_phone,4) <> '+258'
     or length(v_phone) <> 13
     or substring(v_phone,5,1) <> '8'
     or substring(v_phone,6,1) not between '2' and '7'
     or substring(v_phone,7,7) !~ '^[0-9]+$' then
    raise exception 'INVALID_PHONE';
  end if;

  v_email := nullif(lower(btrim(p_email)),'');
  if v_email is not null and (length(v_email) > 254 or position('@' in v_email) < 2) then
    raise exception 'INVALID_EMAIL';
  end if;

  v_note := nullif(btrim(p_internal_note),'');
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'INVALID_INTERNAL_NOTE';
  end if;

  select *
  into v_shop
  from public.barbershops
  where slug=btrim(p_slug)
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select *
  into v_svc
  from public.services
  where id=p_service_id
    and barbershop_id=v_shop.id
    and is_active
  for share;

  if not found then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  if p_haircut_id is not null then
    select *
    into v_haircut
    from public.haircuts
    where id=p_haircut_id
      and barbershop_id=v_shop.id
      and is_active
      and service_id=p_service_id
    for share;

    if not found then
      raise exception 'HAIRCUT_NOT_FOUND';
    end if;
  end if;

  select o.price_cents,o.duration_min into v_svc.price_cents,v_svc.duration_min
  from private.resolve_booking_offer(v_shop.id,p_service_id,p_haircut_id) o;

  v_slot_date := (p_start at time zone v_shop.timezone)::date;

  if p_barber_id is null then
    select (s.barber_ids)[1]
    into v_barber
    from private.available_slots_for_duration(
      btrim(p_slug),p_service_id,null,v_slot_date,v_svc.duration_min,null
    ) s
    where s.slot_start=p_start
    order by (s.barber_ids)[1]
    limit 1;

    if v_barber is null then
      raise exception 'SLOT_UNAVAILABLE';
    end if;
  else
    if not exists (
      select 1
      from public.barbers b
      where b.id=p_barber_id
        and b.barbershop_id=v_shop.id
        and b.is_active
    ) then
      raise exception 'BARBER_NOT_FOUND';
    end if;

    v_barber := p_barber_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('barber-booking:' || v_barber::text, 0)
  );

  select exists (
    select 1
    from private.available_slots_for_duration(
      btrim(p_slug),p_service_id,v_barber,v_slot_date,v_svc.duration_min,null
    ) s
    where s.slot_start=p_start
  )
  into v_requested_slot_exists;

  if not v_requested_slot_exists then
    raise exception 'SLOT_TAKEN';
  end if;

  v_end := p_start + make_interval(mins=>v_svc.duration_min);

  insert into public.customers(
    barbershop_id,name,phone,email
  )
  values (
    v_shop.id,btrim(p_name),v_phone,v_email
  )
  on conflict (barbershop_id,phone) do update
    set name=excluded.name,
        email=coalesce(excluded.email,public.customers.email)
  returning id into v_cust;

  if v_shop.deposit_enabled and v_svc.requires_deposit then
    if v_shop.deposit_mode='percent' then
      v_dep := round(
        v_svc.price_cents * v_shop.deposit_value / 100.0
      )::int;
    else
      v_dep := v_shop.deposit_value;
    end if;

    if v_dep < 0 or v_dep > v_svc.price_cents then
      raise exception 'INVALID_DEPOSIT_CONFIGURATION';
    end if;
  end if;

  if v_dep > 0 then
    v_status := 'pending';
    v_dstate := 'awaiting';
  else
    v_status := 'confirmed';
    v_dstate := 'not_required';
  end if;

  begin
    insert into public.appointments(
      barbershop_id,
      barber_id,
      service_id,
      haircut_id,
      customer_id,
      starts_at,
      ends_at,
      duration_min,
      price_cents,
      status,
      deposit_status,
      deposit_cents,
      hold_expires_at,
      source,
      created_by,
      internal_note,
      confirmed_at
    )
    values (
      v_shop.id,
      v_barber,
      p_service_id,
      p_haircut_id,
      v_cust,
      p_start,
      v_end,
      v_svc.duration_min,
      v_svc.price_cents,
      v_status,
      v_dstate,
      v_dep,
      case when v_dep > 0
        then now()+make_interval(mins=>v_shop.deposit_hold_min)
        else null
      end,
      p_source,
      p_created_by,
      v_note,
      case when v_status='confirmed' then now() else null end
    )
    returning public.appointments.id,public.appointments.manage_token
    into v_id,v_tok;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  perform public.enqueue_appointment_notifications(v_id);

  insert into public.audit_logs(
    barbershop_id,
    actor_id,
    action,
    entity,
    entity_id,
    diff
  )
  values (
    v_shop.id,
    p_created_by,
    'appointment_created',
    'appointment',
    v_id,
    jsonb_build_object(
      'source',p_source::text,
      'status',v_status::text,
      'barber_id',v_barber,
      'service_id',p_service_id,
      'haircut_id',p_haircut_id,
      'deposit_cents',v_dep,
      'needs_payment',(v_dep > 0)
    )
  );

  return query
  select v_id,v_tok,v_dep,(v_dep > 0);
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(p_token uuid)
 RETURNS TABLE(shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, shop_address text, shop_maps_url text, timezone text, cancellation_rule cancellation_rule, customer_name text, appointment_starts_at timestamp with time zone, appointment_ends_at timestamp with time zone, appointment_status appointment_status, deposit_status deposit_state, deposit_cents integer, service_name text, service_price_cents integer, service_duration_min integer, haircut_name text, barber_name text, barber_photo_url text, can_cancel boolean, can_reschedule boolean, action_deadline timestamp with time zone, hold_expires_at timestamp with time zone, payment_methods payment_provider[], latest_payment_status payment_state, latest_payment_failure_code text, latest_payment_failure_reason text, latest_payment_requires_refund boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    sh.name,sh.slug,sh.phone,sh.whatsapp,sh.address,sh.maps_url,sh.timezone,sh.cancellation_rule,
    c.name,a.starts_at,a.ends_at,a.status,a.deposit_status,a.deposit_cents,
    s.name,a.price_cents,a.duration_min,h.name,b.display_name,b.photo_url,
    (
      a.status in ('pending','confirmed') and a.starts_at>now() and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    (
      a.status in ('pending','confirmed') and a.starts_at>now()
      and (a.deposit_status<>'awaiting' or a.hold_expires_at is null or a.hold_expires_at>now())
      and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    case sh.cancellation_rule
      when 'flex_2h' then a.starts_at-interval '2 hours'
      when 'moderate_6h' then a.starts_at-interval '6 hours'
      when 'strict_24h' then a.starts_at-interval '24 hours'
      else null end,
    a.hold_expires_at,
    coalesce((
      select array_agg(pa.provider order by pa.provider)
      from public.payment_accounts pa
      where pa.barbershop_id=sh.id and pa.enabled=true and pa.credential_secret_id is not null
    ),'{}'::public.payment_provider[]),
    lp.status,lp.failure_code,lp.failure_reason,lp.requires_refund
  from public.appointments a
  join public.barbershops sh on sh.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services s on s.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join lateral (
    select p.* from public.payments p where p.appointment_id=a.id order by p.created_at desc limit 1
  ) lp on true
  where a.manage_token=p_token;
$function$;
CREATE OR REPLACE FUNCTION public.get_reschedule_slots_by_token(p_token uuid, p_date date)
 RETURNS TABLE(slot_start timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  sh public.barbershops%rowtype;
  v_action_deadline timestamptz;
begin
  select * into a
  from public.appointments
  where manage_token=p_token
  limit 1;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  select * into sh
  from public.barbershops
  where id=a.barbershop_id;

  if a.status not in ('pending','confirmed') or a.starts_at <= now() then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  if sh.cancellation_rule='contact_only' then
    raise exception 'CANCELLATION_POLICY_CONTACT_ONLY';
  end if;

  v_action_deadline := a.starts_at;
  if sh.cancellation_rule='flex_2h' then
    v_action_deadline := a.starts_at - interval '2 hours';
  elsif sh.cancellation_rule='moderate_6h' then
    v_action_deadline := a.starts_at - interval '6 hours';
  elsif sh.cancellation_rule='strict_24h' then
    v_action_deadline := a.starts_at - interval '24 hours';
  end if;

  if now() > v_action_deadline then
    raise exception 'CANCELLATION_POLICY_LOCKED';
  end if;

  if a.deposit_status='awaiting'
     and a.hold_expires_at is not null
     and a.hold_expires_at <= now() then
    raise exception 'BOOKING_HOLD_EXPIRED';
  end if;

  return query
  select x.slot_start
  from private.available_slots_for_duration(
    sh.slug,
    a.service_id,
    a.barber_id,
    p_date,a.duration_min,a.id
  ) x
  order by x.slot_start;
end;
$function$;
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(p_token uuid, p_new_start timestamp with time zone)
 RETURNS TABLE(new_starts_at timestamp with time zone, new_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  sh public.barbershops%rowtype;
  svc public.services%rowtype;
  c public.customers%rowtype;
  v_date date;
  v_end timestamptz;
  v_available boolean;
  v_deadline timestamptz;
  v_old_start timestamptz;
begin
  if p_new_start is null then
    raise exception 'INVALID_DATE';
  end if;

  select * into a
  from public.appointments
  where manage_token=p_token;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  select * into sh
  from public.barbershops
  where id=a.barbershop_id;

  if a.status not in ('pending','confirmed') or a.starts_at <= now() then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  if sh.cancellation_rule='contact_only' then
    raise exception 'CANCELLATION_POLICY_CONTACT_ONLY';
  end if;

  v_deadline := a.starts_at;
  if sh.cancellation_rule='flex_2h' then
    v_deadline := a.starts_at - interval '2 hours';
  elsif sh.cancellation_rule='moderate_6h' then
    v_deadline := a.starts_at - interval '6 hours';
  elsif sh.cancellation_rule='strict_24h' then
    v_deadline := a.starts_at - interval '24 hours';
  end if;

  if now() > v_deadline then
    raise exception 'CANCELLATION_POLICY_LOCKED';
  end if;

  if a.deposit_status='awaiting'
     and a.hold_expires_at is not null
     and a.hold_expires_at <= now() then
    raise exception 'BOOKING_HOLD_EXPIRED';
  end if;

  v_old_start := a.starts_at;

  perform pg_advisory_xact_lock(
    hashtextextended('barber-booking:' || a.barber_id::text, 0)
  );

  select * into a
  from public.appointments
  where id=a.id
  for update;

  if a.starts_at=p_new_start then
    return query select a.starts_at,a.ends_at;
    return;
  end if;

  select * into svc
  from public.services
  where id=a.service_id
    and barbershop_id=a.barbershop_id
    and is_active;

  if not found then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  v_date := (p_new_start at time zone sh.timezone)::date;

  select exists(
    select 1
    from private.available_slots_for_duration(
      sh.slug,a.service_id,a.barber_id,v_date,a.duration_min,a.id
    ) x
    where x.slot_start=p_new_start
  ) into v_available;

  if not v_available then
    raise exception 'SLOT_TAKEN';
  end if;

  v_end := p_new_start + make_interval(mins=>a.duration_min);

  select * into c
  from public.customers
  where id=a.customer_id
    and barbershop_id=a.barbershop_id;

  update public.notifications
  set status='skipped',
      error='appointment_rescheduled'
  where appointment_id=a.id
    and status='queued'
    and template_key in ('reminder_24h','reminder_1h');

  update public.appointments
  set starts_at=p_new_start,
      ends_at=v_end
  where id=a.id;

  if c.phone is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values(
      a.barbershop_id,a.id,'whatsapp','appointment_rescheduled',c.phone,now(),
      jsonb_build_object(
        'manage_token',a.manage_token,
        'old_starts_at',v_old_start,
        'starts_at',p_new_start,
        'ends_at',v_end
      )
    );

    if p_new_start - interval '24 hours' > now() then
      insert into public.notifications(
        barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
      )
      values(
        a.barbershop_id,a.id,'whatsapp','reminder_24h',c.phone,
        p_new_start-interval '24 hours',
        jsonb_build_object('manage_token',a.manage_token)
      );
    end if;

    if p_new_start - interval '1 hour' > now() then
      insert into public.notifications(
        barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
      )
      values(
        a.barbershop_id,a.id,'whatsapp','reminder_1h',c.phone,
        p_new_start-interval '1 hour',
        jsonb_build_object('manage_token',a.manage_token)
      );
    end if;
  end if;

  if c.email is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values(
      a.barbershop_id,a.id,'email','appointment_rescheduled',c.email,now(),
      jsonb_build_object(
        'manage_token',a.manage_token,
        'old_starts_at',v_old_start,
        'starts_at',p_new_start,
        'ends_at',v_end
      )
    );
  end if;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values(
    a.barbershop_id,null,'appointment_rescheduled','appointment',a.id,
    jsonb_build_object(
      'source','token',
      'old_starts_at',v_old_start,
      'new_starts_at',p_new_start,
      'new_ends_at',v_end
    )
  );

  return query select p_new_start,v_end;
exception
  when exclusion_violation then
    raise exception 'SLOT_TAKEN';
end;
$function$;
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_operator(p_shop uuid, p_appointment uuid, p_new_start timestamp with time zone, p_new_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(appointment_id uuid, new_starts_at timestamp with time zone, new_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  svc public.services%rowtype;
  c public.customers%rowtype;
  sh public.barbershops%rowtype;
  target_barber uuid;
  new_barber_name text;
  old_barber uuid;
  old_start timestamptz;
  v_date date;
  v_end timestamptz;
  v_available boolean;
begin
  if p_new_start is null then raise exception 'INVALID_DATE'; end if;

  select * into a from public.appointments where id=p_appointment and barbershop_id=p_shop;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  target_barber:=coalesce(p_new_barber_id,a.barber_id);
  old_barber:=a.barber_id;

  if target_barber is null then raise exception 'BARBER_NOT_FOUND'; end if;

  if private.is_platform_admin() then
    null;
  elsif private.is_member(p_shop,array['owner','manager']::public.app_role[]) then
    null;
  elsif private.is_member(p_shop,array['barber']::public.app_role[]) then
    if old_barber<>private.my_barber_id(p_shop) or target_barber<>private.my_barber_id(p_shop) then
      raise exception 'SHOP_OPERATOR_REQUIRED';
    end if;
  else
    raise exception 'SHOP_OPERATOR_REQUIRED';
  end if;

  if a.status not in ('pending','confirmed') or a.starts_at<=now() then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  if target_barber<>old_barber then
    if target_barber::text<old_barber::text then
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||target_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
    else
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||target_barber::text,0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
  end if;

  select * into a from public.appointments where id=p_appointment and barbershop_id=p_shop for update;

  if a.starts_at=p_new_start and a.barber_id=target_barber then
    return query select a.id,a.starts_at,a.ends_at;
    return;
  end if;

  select * into sh from public.barbershops where id=p_shop;
  select * into svc from public.services where id=a.service_id and barbershop_id=p_shop and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.barbers b
    join public.barber_services bs on bs.barber_id=b.id
    where b.id=target_barber and b.barbershop_id=p_shop and b.is_active and bs.service_id=a.service_id
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  if p_new_start<=now() then raise exception 'INVALID_DATE'; end if;
  v_date:=(p_new_start at time zone sh.timezone)::date;

  select exists(
    select 1 from private.available_slots_for_duration(sh.slug,a.service_id,target_barber,v_date,a.duration_min,a.id)
    where slot_start=p_new_start
  ) into v_available;

  if not v_available then raise exception 'SLOT_TAKEN'; end if;

  old_start:=a.starts_at;
  v_end:=p_new_start+make_interval(mins=>a.duration_min);

  select * into c from public.customers where id=a.customer_id and barbershop_id=p_shop;
  select b.display_name into new_barber_name from public.barbers b where b.id=target_barber and b.barbershop_id=p_shop;

  update public.notifications set status='skipped',error='appointment_rescheduled'
  where appointment_id=a.id and status='queued' and template_key in ('reminder_24h','reminder_1h');

  update public.appointments set barber_id=target_barber,starts_at=p_new_start,ends_at=v_end where id=a.id;

  if c.phone is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(p_shop,a.id,'whatsapp','appointment_rescheduled',c.phone,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',old_start,'starts_at',p_new_start,'ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber));
    if p_new_start-interval '24 hours'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_24h',c.phone,p_new_start-interval '24 hours',jsonb_build_object('manage_token',a.manage_token));
    end if;
    if p_new_start-interval '1 hour'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_1h',c.phone,p_new_start-interval '1 hour',jsonb_build_object('manage_token',a.manage_token));
    end if;
  end if;

  if c.email is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(p_shop,a.id,'email','appointment_rescheduled',c.email,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',old_start,'starts_at',p_new_start,'ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber));
  end if;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'appointment_rescheduled','appointment',a.id,
    jsonb_build_object('source','operator','old_starts_at',old_start,'new_starts_at',p_new_start,'new_ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber,'new_barber_name',new_barber_name));

  return query select a.id,p_new_start,v_end;
exception when exclusion_violation then
  raise exception 'SLOT_TAKEN';
end;
$function$;
CREATE OR REPLACE FUNCTION public.join_waitlist(p_slug text, p_service_id uuid, p_customer_name text, p_phone text, p_haircut_id uuid DEFAULT NULL::uuid, p_barber_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_period text DEFAULT 'any'::text)
 RETURNS TABLE(status waitlist_status, queued_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  svc public.services%rowtype;
  v_phone text;
  v_email text;
  v_from date;
  v_to date;
  v_period text;
  v_existing public.waitlist_entries%rowtype;
  v_join_key text;
begin
  select b.*
  into sh
  from public.barbershops b
  where b.slug=lower(btrim(p_slug))
    and b.status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select s.*
  into svc
  from public.services s
  where s.id=p_service_id
    and s.barbershop_id=sh.id
    and s.is_active;

  if not found then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  if p_haircut_id is not null and not exists (
    select 1
    from public.haircuts h
    where h.id=p_haircut_id
      and h.barbershop_id=sh.id
      and h.is_active
      and h.service_id=p_service_id
  ) then
    raise exception 'HAIRCUT_NOT_FOUND';
  end if;

  if p_barber_id is not null and not exists (
    select 1
    from public.barbers b
    join public.barber_services bs on bs.barber_id=b.id
    where b.id=p_barber_id
      and b.barbershop_id=sh.id
      and b.is_active
      and bs.service_id=p_service_id
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  if p_customer_name is null
     or length(btrim(p_customer_name)) < 2
     or length(btrim(p_customer_name)) > 120 then
    raise exception 'INVALID_NAME';
  end if;

  v_phone := regexp_replace(btrim(coalesce(p_phone,'')), '[[:space:]-]+', '', 'g');

  if v_phone like '+258%' then
    null;
  elsif v_phone like '258%' then
    v_phone := '+' || v_phone;
  elsif v_phone like '8%' then
    v_phone := '+258' || v_phone;
  else
    raise exception 'INVALID_PHONE';
  end if;

  if v_phone !~ '^\+2588[2-7][0-9]{7}$' then
    raise exception 'INVALID_PHONE';
  end if;

  v_email := nullif(lower(btrim(p_email)),'');
  if v_email is not null
     and (length(v_email) > 254 or position('@' in v_email) < 2) then
    raise exception 'INVALID_EMAIL';
  end if;

  v_from := coalesce(
    p_date_from,
    (now() at time zone sh.timezone)::date
  );
  v_to := coalesce(p_date_to,v_from);

  if v_to < v_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if v_from < (now() at time zone sh.timezone)::date then
    raise exception 'INVALID_DATE';
  end if;

  if v_to > (now() at time zone sh.timezone)::date + sh.max_advance_days then
    raise exception 'WAITLIST_DATE_TOO_FAR';
  end if;

  v_period := lower(btrim(coalesce(p_period,'any')));

  if v_period not in ('morning','afternoon','evening','any') then
    raise exception 'WAITLIST_PERIOD_INVALID';
  end if;

  v_join_key :=
    'waitlist-join:' ||
    sh.id::text || ':' ||
    p_service_id::text || ':' ||
    v_phone || ':' ||
    coalesce(p_barber_id::text,'any') || ':' ||
    v_from::text || ':' ||
    v_to::text || ':' ||
    v_period;

  perform pg_advisory_xact_lock(hashtextextended(v_join_key,0));

  select w.*
  into v_existing
  from public.waitlist_entries w
  where w.barbershop_id=sh.id
    and w.service_id=p_service_id
    and w.phone=v_phone
    and w.status in ('waiting','offered')
    and coalesce(
      w.barber_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    ) = coalesce(
      p_barber_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and w.date_from=v_from
    and w.date_to=v_to
    and w.period=v_period
  order by w.created_at
  limit 1;

  if found then
    return query
    select v_existing.status,v_existing.created_at;
    return;
  end if;

  insert into public.waitlist_entries(
    barbershop_id,
    service_id,
    haircut_id,
    barber_id,
    customer_name,
    phone,
    email,
    date_from,
    date_to,
    period,
    status
  )
  values(
    sh.id,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    btrim(p_customer_name),
    v_phone,
    v_email,
    v_from,
    v_to,
    v_period,
    'waiting'
  )
  returning waitlist_entries.status,waitlist_entries.created_at
  into status,queued_at;

  insert into public.audit_logs(
    barbershop_id,
    actor_id,
    action,
    entity,
    diff
  )
  values(
    sh.id,
    auth.uid(),
    'waitlist_joined',
    'waitlist_entry',
    jsonb_build_object(
      'service_id',p_service_id,
      'haircut_id',p_haircut_id,
      'barber_id',p_barber_id,
      'date_from',v_from,
      'date_to',v_to,
      'period',v_period
    )
  );

  return next;
end;
$function$;
CREATE OR REPLACE FUNCTION private.offer_next_waitlist_core(p_shop uuid, p_slot_start timestamp with time zone, p_barber_id uuid)
 RETURNS TABLE(waitlist_entry_id uuid, offer_token uuid, offer_expires_at timestamp with time zone, customer_name text, phone text, email text, service_id uuid, haircut_id uuid, barber_id uuid, slot_start timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  w public.waitlist_entries%rowtype;
  v_date date;
  v_available boolean;
  v_offer_token uuid;
  v_expires timestamptz;
begin
  if p_shop is null or p_slot_start is null or p_barber_id is null then
    raise exception 'WAITLIST_SLOT_REQUIRED';
  end if;

  select * into sh
  from public.barbershops
  where id=p_shop
    and status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=p_shop
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'waitlist-slot:' || p_shop::text || ':' || p_barber_id::text || ':' || p_slot_start::text,
      0
    )
  );

  v_date := (p_slot_start at time zone sh.timezone)::date;

  update public.waitlist_entries we
  set status='expired'
  where we.barbershop_id=p_shop
    and we.status='offered'
    and we.offer_slot_start=p_slot_start
    and we.offer_barber_id=p_barber_id
    and we.offer_expires_at <= now();

  if exists (
    select 1
    from public.waitlist_entries active_offer
    where active_offer.barbershop_id=p_shop
      and active_offer.status='offered'
      and active_offer.offer_slot_start=p_slot_start
      and active_offer.offer_barber_id=p_barber_id
      and active_offer.offer_expires_at > now()
  ) then
    return;
  end if;

  for w in
    select we.*
    from public.waitlist_entries we
    where we.barbershop_id=p_shop
      and we.status='waiting'
      and exists (
        select 1
        from public.services s
        where s.id=we.service_id
          and s.barbershop_id=p_shop
          and s.is_active
      )
      and (we.haircut_id is null or exists(select 1 from public.haircuts h where h.id=we.haircut_id and h.barbershop_id=p_shop and h.service_id=we.service_id and h.is_active))
      and (we.barber_id is null or we.barber_id=p_barber_id)
      and (we.date_from is null or v_date >= we.date_from)
      and (we.date_to is null or v_date <= we.date_to)
      and private.waitlist_period_matches(
        we.period,
        p_slot_start,
        sh.timezone
      )
    order by we.created_at,we.id
    for update skip locked
  loop
    select exists (
      select 1
      from public.get_offer_available_slots(
        sh.slug,
        w.service_id,
        p_barber_id,
        v_date,w.haircut_id
      ) av
      where av.slot_start=p_slot_start
    )
    into v_available;

    if v_available then
      v_offer_token := gen_random_uuid();
      v_expires := now() + interval '15 minutes';

      update public.waitlist_entries we
      set status='offered',
          offer_token=v_offer_token,
          offer_slot_start=p_slot_start,
          offer_barber_id=p_barber_id,
          offer_expires_at=v_expires
      where we.id=w.id
      returning
        we.id,
        we.offer_token,
        we.offer_expires_at,
        we.customer_name,
        we.phone,
        we.email,
        we.service_id,
        we.haircut_id,
        we.barber_id,
        we.offer_slot_start
      into
        waitlist_entry_id,
        offer_token,
        offer_expires_at,
        customer_name,
        phone,
        email,
        service_id,
        haircut_id,
        barber_id,
        slot_start;

      insert into public.notifications(
        barbershop_id,
        waitlist_entry_id,
        channel,
        template_key,
        recipient,
        scheduled_for,
        payload
      )
      values(
        p_shop,
        waitlist_entry_id,
        'whatsapp',
        'waitlist_offer',
        phone,
        now(),
        jsonb_build_object(
          'offer_token',offer_token,
          'slot_start',slot_start,
          'expires_at',offer_expires_at,
          'service_id',service_id,
          'barber_id',barber_id,
          'shop_slug',sh.slug,
          'shop_name',sh.name
        )
      );

      if email is not null then
        insert into public.notifications(
          barbershop_id,
          waitlist_entry_id,
          channel,
          template_key,
          recipient,
          scheduled_for,
          payload
        )
        values(
          p_shop,
          waitlist_entry_id,
          'email',
          'waitlist_offer',
          email,
          now(),
          jsonb_build_object(
            'offer_token',offer_token,
            'slot_start',slot_start,
            'expires_at',offer_expires_at,
            'service_id',service_id,
            'barber_id',barber_id,
            'shop_slug',sh.slug,
            'shop_name',sh.name
          )
        );
      end if;

      insert into public.audit_logs(
        barbershop_id,actor_id,action,entity,entity_id,diff
      )
      values(
        p_shop,
        auth.uid(),
        'waitlist_offer_created',
        'waitlist_entry',
        waitlist_entry_id,
        jsonb_build_object(
          'slot_start',slot_start,
          'barber_id',barber_id,
          'offer_expires_at',offer_expires_at
        )
      );

      return next;
      return;
    end if;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_waitlist_offer(p_token uuid)
 RETURNS TABLE(status waitlist_status, can_claim boolean, customer_name text, service_name text, service_price_cents integer, service_duration_min integer, haircut_name text, barber_name text, slot_start timestamp with time zone, offer_expires_at timestamp with time zone, shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, timezone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    w.status,
    (w.status='offered' and w.offer_expires_at > now() and (w.haircut_id is null or (h.service_id=w.service_id and h.is_active))) as can_claim,
    w.customer_name,
    s.name,
    coalesce(h.price_cents,s.price_cents),
    coalesce(h.duration_min,s.duration_min),
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
CREATE OR REPLACE FUNCTION public.seed_haircut_catalogue(p_shop uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  if not private.is_member(p_shop, array['owner','manager']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
  with c(name, description, ord) as (values
    ('Low fade','Degradê baixo, junto à orelha e nuca.',1),
    ('Mid fade','Degradê a meia altura, equilibrado.',2),
    ('High fade','Degradê alto, contraste forte.',3),
    ('Taper fade','Degradê suave só nas patilhas e nuca.',4),
    ('Skin fade','Degradê até à pele.',5),
    ('Drop fade','Degradê que desce em curva atrás da orelha.',6),
    ('Burst fade','Degradê em leque à volta da orelha.',7),
    ('Buzz cut','Máquina uniforme, muito curto.',8),
    ('Crew cut','Curto, topo ligeiramente mais longo.',9),
    ('Caesar','Franja curta e recta, textura no topo.',10),
    ('French crop','Franja texturizada com laterais curtas.',11),
    ('Pompadour','Volume para cima e para trás.',12),
    ('Quiff','Volume frontal, mais solto que o pompadour.',13),
    ('Slick back','Penteado para trás, liso.',14),
    ('Afro shape-up','Afro contornado com linhas definidas.',15),
    ('Waves','Ondas 360 com escova.',16),
    ('Twists','Torções curtas definidas.',17),
    ('Dreads retwist','Manutenção e retorção de dreads.',18),
    ('Corte à tesoura','Só tesoura, acabamento natural.',19),
    ('Corte infantil','Corte para crianças, rápido e calmo.',20),
    ('Design freestyle','Desenhos à navalha ao gosto do cliente.',21),
    ('Careca à navalha','Rapado total com navalha.',22))
  insert into haircuts(barbershop_id,name,description,sort_order)
  select p_shop, c.name, c.description, c.ord from c
  where not exists (select 1 from haircuts h where h.barbershop_id=p_shop and lower(h.name)=lower(c.name));
  get diagnostics n = row_count;
  perform private.link_reference_haircuts(p_shop);
  return n;
end $function$;
