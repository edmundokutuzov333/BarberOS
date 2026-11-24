-- Complete scoped forward candidate, outside the chain until history review completes.
-- Reviewed current contracts replace legacy implementations without broad function grants,
-- fictional tenant data, deleted history or payment-provider execution.
alter table public.services add column if not exists photo_url text;

-- The old staging return exposed review_id instead of has_review. No CASCADE: any
-- unexpected SQL dependency aborts the transaction rather than being deleted.
drop function if exists public.get_review_by_token(uuid);

CREATE OR REPLACE FUNCTION private.prevent_platform_admin_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and current_user not in ('postgres','service_role','supabase_admin')
     and not private.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.prevent_shop_platform_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (new.status is distinct from old.status or new.plan_id is distinct from old.plan_id)
     and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.prevent_tenant_reparent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  new_row jsonb;
  old_row jsonb;
BEGIN
  IF tg_op = 'UPDATE' THEN
    new_row := to_jsonb(new);
    old_row := to_jsonb(old);
    IF new_row ? 'barbershop_id'
       AND (new_row -> 'barbershop_id') IS DISTINCT FROM (old_row -> 'barbershop_id')
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
      RAISE EXCEPTION 'TENANT_IMMUTABLE';
    END IF;
  END IF;
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status public.appointment_status DEFAULT NULL::public.appointment_status, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(appointment_id uuid, barber_id uuid, barber_name text, customer_id uuid, customer_name text, customer_phone text, customer_email text, service_id uuid, service_name text, haircut_id uuid, haircut_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, duration_min integer, price_cents integer, status public.appointment_status, deposit_status public.deposit_state, deposit_cents integer, hold_expires_at timestamp with time zone, source public.booking_source, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(p_shop uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz text;
  v_today date;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_month_from_ts timestamptz;
  v_barber uuid;
  v_is_barber boolean;
  v_today_count bigint;
  v_booked_minutes numeric;
  v_capacity_minutes numeric;
  v_revenue_cents bigint;
  v_no_shows bigint;
  v_pending_deposit bigint;
  v_waiting bigint;
  v_new_reviews bigint;
  v_has_barbers boolean;
  v_next jsonb;
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  perform private.require_agenda_access(p_shop);

  select s.timezone
    into v_tz
  from public.barbershops s
  where s.id=p_shop;

  if v_tz is null then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber := private.my_barber_id(p_shop);
    if v_barber is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_from_ts := v_today::timestamp at time zone v_tz;
  v_to_ts := (v_today + 1)::timestamp at time zone v_tz;
  v_month_from_ts := date_trunc('month', v_today::timestamp) at time zone v_tz;

  select count(*)::bigint
    into v_today_count
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and a.status<>'cancelled'
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(a.duration_min) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::numeric
    into v_booked_minutes
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(capacity_minutes),0)::numeric
    into v_capacity_minutes
  from private.report_capacity_by_day(
    p_shop,
    v_today,
    v_today,
    v_barber
  );

  select coalesce(sum(a.price_cents) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::bigint
    into v_revenue_cents
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_no_shows
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='no_show'
    and a.starts_at>=v_month_from_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_pending_deposit
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='pending'
    and a.deposit_status='awaiting'
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  if v_is_barber then
    v_waiting := 0;
  else
    select count(*)::bigint
      into v_waiting
    from public.waitlist_entries w
    where w.barbershop_id=p_shop
      and w.status='waiting';
  end if;

  select count(*)::bigint
    into v_new_reviews
  from public.reviews r
  where r.barbershop_id=p_shop
    and r.created_at>=now()-interval '7 days'
    and (not v_is_barber or r.barber_id=v_barber);

  select exists(
    select 1
    from public.barbers b
    where b.barbershop_id=p_shop
      and b.is_active
      and (not v_is_barber or b.id=v_barber)
  )
  into v_has_barbers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'appointment_id', x.id,
        'starts_at', x.starts_at,
        'status', x.status,
        'customer_name', x.customer_name,
        'service_name', x.service_name,
        'haircut_name', x.haircut_name,
        'barber_name', x.barber_name
      )
      order by x.starts_at
    ),
    '[]'::jsonb
  )
    into v_next
  from (
    select
      a.id,
      a.starts_at,
      a.status,
      c.name as customer_name,
      s.name as service_name,
      h.name as haircut_name,
      b.display_name as barber_name
    from public.appointments a
    join public.customers c
      on c.id=a.customer_id
     and c.barbershop_id=a.barbershop_id
    join public.services s
      on s.id=a.service_id
     and s.barbershop_id=a.barbershop_id
    left join public.haircuts h
      on h.id=a.haircut_id
     and h.barbershop_id=a.barbershop_id
    join public.barbers b
      on b.id=a.barber_id
     and b.barbershop_id=a.barbershop_id
    where a.barbershop_id=p_shop
      and a.starts_at>=now()
      and a.starts_at<v_to_ts
      and a.status in ('pending','confirmed')
      and (not v_is_barber or a.barber_id=v_barber)
    order by a.starts_at
    limit 5
  ) x;

  return jsonb_build_object(
    'today', v_today_count,
    'occupancy', case
      when v_capacity_minutes>0
        then round(least(100::numeric,(v_booked_minutes/v_capacity_minutes)*100),2)
      else null
    end,
    'revenue', v_revenue_cents,
    'noShows', v_no_shows,
    'pendingDeposit', v_pending_deposit,
    'waiting', v_waiting,
    'newReviews', v_new_reviews,
    'hasBarbers', v_has_barbers,
    'next', v_next
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_notification_metrics(p_shop uuid)
 RETURNS TABLE(queued_count bigint, processing_count bigint, failed_count bigint, sent_today_count bigint, sent_7d_count bigint, delivery_rate_7d numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.require_shop_operator(p_shop);

  return query
  select
    count(*) filter (where n.status='queued')::bigint,
    count(*) filter (where n.status='processing')::bigint,
    count(*) filter (where n.status='failed')::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= date_trunc('day',now()))::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= now()-interval '7 days')::bigint,
    case
      when count(*) filter (
        where n.status in ('sent','failed')
          and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
      ) = 0 then 0::numeric
      else round(
        100.0 * count(*) filter (
          where n.status='sent'
            and n.sent_at >= now()-interval '7 days'
        ) / count(*) filter (
          where n.status in ('sent','failed')
            and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
        ),2)
    end
  from public.notifications n
  where n.barbershop_id=p_shop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_barbershop(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  v_payload jsonb;
begin
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select *
  into sh
  from public.barbershops
  where slug=btrim(p_slug)
    and status in ('active','trial')
  limit 1;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'shop', jsonb_build_object(
      'name', sh.name,
      'slug', sh.slug,
      'description', sh.description,
      'logo_url', sh.logo_url,
      'cover_url', sh.cover_url,
      'theme_key', sh.theme_key,
      'phone', sh.phone,
      'whatsapp', sh.whatsapp,
      'instagram', sh.instagram,
      'address', sh.address,
      'maps_url', sh.maps_url,
      'lat', sh.lat,
      'lng', sh.lng,
      'timezone', sh.timezone,
      'status', sh.status,
      'deposit_enabled', sh.deposit_enabled,
      'deposit_mode', sh.deposit_mode,
      'deposit_value', sh.deposit_value,
      'deposit_hold_min', sh.deposit_hold_min,
      'slot_interval_min', sh.slot_interval_min,
      'min_lead_time_min', sh.min_lead_time_min,
      'max_advance_days', sh.max_advance_days,
      'cancellation_rule', sh.cancellation_rule
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'price_cents', s.price_cents,
          'duration_min', s.duration_min,
          'requires_deposit', s.requires_deposit,
          'photo_url', s.photo_url
        )
        order by s.sort_order, s.name
      )
      from public.services s
      where s.barbershop_id=sh.id
        and s.is_active
    ), '[]'::jsonb),
    'haircuts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'service_id', h.service_id,
          'name', h.name,
          'description', h.description,
          'photo_url', h.photo_url,
          'price_cents', h.price_cents,
          'duration_min', h.duration_min
        )
        order by h.sort_order, h.name
      )
      from public.haircuts h
      where h.barbershop_id=sh.id
        and h.is_active
    ), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'display_name', b.display_name,
          'photo_url', b.photo_url,
          'bio', b.bio,
          'years_experience', b.years_experience,
          'rating_avg', b.rating_avg,
          'rating_count', b.rating_count,
          'service_ids', coalesce((
            select jsonb_agg(bs.service_id order by bs.service_id)
            from public.barber_services bs
            where bs.barber_id=b.id
          ), '[]'::jsonb)
        )
        order by b.sort_order, b.display_name
      )
      from public.barbers b
      where b.barbershop_id=sh.id
        and b.is_active
    ), '[]'::jsonb),
    'working_hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', wh.weekday,
          'opens_at', wh.opens_at,
          'closes_at', wh.closes_at,
          'is_closed', wh.is_closed
        )
        order by wh.weekday
      )
      from public.working_hours wh
      where wh.barbershop_id=sh.id
        and wh.barber_id is null
    ), '[]'::jsonb),
    'reviews', jsonb_build_object(
      'rating_avg', coalesce((
        select round(avg(r.rating)::numeric,2)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),0),
      'rating_count', (
        select count(*)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rating', r.rating,
            'comment', r.comment,
            'created_at', r.created_at
          )
          order by r.created_at desc
        )
        from (
          select rating,comment,created_at
          from public.reviews
          where barbershop_id=sh.id
            and is_published
          order by created_at desc
          limit 6
        ) r
      ), '[]'::jsonb)
    )
  )
  into v_payload;

  return v_payload;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_review_by_token(p_token uuid)
 RETURNS TABLE(shop_name text, shop_slug text, timezone text, customer_name text, appointment_status public.appointment_status, appointment_completed_at timestamp with time zone, service_name text, haircut_name text, barber_name text, barber_photo_url text, available_at timestamp with time zone, has_review boolean, rating integer, comment text, review_is_published boolean, review_created_at timestamp with time zone, can_submit boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_token is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  return query
  select
    s.name,
    s.slug,
    s.timezone,
    c.name,
    a.status,
    a.completed_at,
    svc.name,
    h.name,
    b.display_name,
    b.photo_url,
    case
      when a.completed_at is null then null
      else a.completed_at + interval '1 hour'
    end,
    r.id is not null,
    r.rating,
    r.comment,
    r.is_published,
    r.created_at,
    (
      a.status='completed'
      and a.completed_at is not null
      and now() >= a.completed_at + interval '1 hour'
      and r.id is null
    )
  from public.appointments a
  join public.barbershops s on s.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services svc on svc.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join public.reviews r on r.appointment_id=a.id
  where a.manage_token=p_token;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_members(p_shop uuid)
 RETURNS TABLE(id uuid, user_id uuid, role public.app_role, full_name text, email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_shop is null then raise exception 'SHOP_REQUIRED'; end if;
  if private.is_platform_admin() then
    null;
  elsif not private.is_member(p_shop,array['owner']::public.app_role[]) then
    raise exception 'OWNER_REQUIRED';
  end if;
  return query
  select m.id,m.user_id,m.role,p.full_name,u.email::text,m.created_at
  from public.barbershop_members m
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.barbershop_id=p_shop
  order by m.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_review_by_token(p_token uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS TABLE(review_id uuid, rating integer, comment text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_appointment public.appointments%rowtype;
  v_existing public.reviews%rowtype;
  v_comment text;
  v_review_id uuid;
  v_created_at timestamptz;
begin
  if p_token is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'REVIEW_RATING_INVALID'; end if;

  v_comment := nullif(btrim(coalesce(p_comment,'')),'');
  if v_comment is not null and length(v_comment)>2000 then raise exception 'REVIEW_COMMENT_TOO_LONG'; end if;

  select a.* into v_appointment
  from public.appointments a
  where a.manage_token=p_token
  for update;

  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.status<>'completed' or v_appointment.completed_at is null then raise exception 'REVIEW_APPOINTMENT_NOT_COMPLETED'; end if;
  if now()<v_appointment.completed_at+interval '1 hour' then raise exception 'REVIEW_NOT_AVAILABLE_YET'; end if;

  select r.* into v_existing
  from public.reviews r
  where r.appointment_id=v_appointment.id;

  if found then
    return query select v_existing.id,v_existing.rating,v_existing.comment,v_existing.created_at;
    return;
  end if;

  begin
    insert into public.reviews(barbershop_id,barber_id,appointment_id,rating,comment,is_published)
    values(v_appointment.barbershop_id,v_appointment.barber_id,v_appointment.id,p_rating,v_comment,true);
  exception when unique_violation then
    select r.* into v_existing
    from public.reviews r
    where r.appointment_id=v_appointment.id;
    if found then
      return query select v_existing.id,v_existing.rating,v_existing.comment,v_existing.created_at;
      return;
    end if;
    raise;
  end;

  select r.id,r.created_at into v_review_id,v_created_at
  from public.reviews r
  where r.appointment_id=v_appointment.id;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(
    v_appointment.barbershop_id,null,'review_submitted','review',v_review_id,
    jsonb_build_object('appointment_id',v_appointment.id,'barber_id',v_appointment.barber_id,'rating',p_rating,'has_comment',v_comment is not null)
  );

  return query select v_review_id,p_rating,v_comment,v_created_at;
end;
$function$;

-- Role-scoped policies from the reviewed Phase 22 intent.


drop policy if exists mem_read on public.barbershop_members;
drop policy if exists mem_read_v22 on public.barbershop_members;
create policy mem_read_v22 on public.barbershop_members
for select to authenticated
using (
  user_id=(select auth.uid())
  or private.is_member(barbershop_id,array['owner']::public.app_role[])
  or private.is_platform_admin()
);

drop policy if exists barbers_public_read on public.barbers;
drop policy if exists barbers_self_update on public.barbers;
drop policy if exists barbers_write on public.barbers;
drop policy if exists barbers_read_v22 on public.barbers;
create policy barbers_read_v22 on public.barbers
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and id=private.my_barber_id(barbershop_id)
  )
);
drop policy if exists barbers_write_v22 on public.barbers;
create policy barbers_write_v22 on public.barbers
for all to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
)
with check (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
);

drop policy if exists bs_read on public.barber_services;
drop policy if exists bs_read_v22 on public.barber_services;
create policy bs_read_v22 on public.barber_services
for select to authenticated
using (
  exists (
    select 1
    from public.barbers b
    where b.id=barber_id
      and (
        private.is_platform_admin()
        or private.is_member(b.barbershop_id,array['owner','manager']::public.app_role[])
        or (
          private.is_member(b.barbershop_id,array['barber']::public.app_role[])
          and b.id=private.my_barber_id(b.barbershop_id)
        )
      )
  )
);

drop policy if exists cust_read on public.customers;
drop policy if exists cust_read_v22 on public.customers;
create policy cust_read_v22 on public.customers
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and exists (
      select 1
      from public.appointments a
      where a.barbershop_id=customers.barbershop_id
        and a.customer_id=customers.id
        and a.barber_id=private.my_barber_id(customers.barbershop_id)
    )
  )
);

drop policy if exists wl_read on public.waitlist_entries;
drop policy if exists wl_read_v22 on public.waitlist_entries;
create policy wl_read_v22 on public.waitlist_entries
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
);

drop policy if exists rev_public_read on public.reviews;
drop policy if exists rev_read_v22 on public.reviews;
create policy rev_read_v22 on public.reviews
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and barber_id=private.my_barber_id(barbershop_id)
  )
);

drop policy if exists schedule_overrides_team_read on public.schedule_overrides;
drop policy if exists schedule_overrides_read_v22 on public.schedule_overrides;
create policy schedule_overrides_read_v22 on public.schedule_overrides
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and (barber_id=private.my_barber_id(barbershop_id) or barber_id is null)
  )
);

drop policy if exists tb_read on public.time_blocks;
drop policy if exists tb_read_v22 on public.time_blocks;
create policy tb_read_v22 on public.time_blocks
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and barber_id=private.my_barber_id(barbershop_id)
  )
);

drop policy if exists wh_public_read on public.working_hours;
drop policy if exists wh_read_v22 on public.working_hours;
create policy wh_read_v22 on public.working_hours
for select to authenticated
using (
  private.is_platform_admin()
  or private.is_member(barbershop_id,array['owner','manager']::public.app_role[])
  or (
    private.is_member(barbershop_id,array['barber']::public.app_role[])
    and (barber_id=private.my_barber_id(barbershop_id) or barber_id is null)
  )
);


-- Align only core table ACLs; commerce-specific policies/grants remain untouched.
revoke all on public.profiles,public.plans,public.barbershops,public.barbershop_members,public.barbers,public.services,public.barber_services,public.haircuts,public.working_hours,public.time_blocks,public.schedule_overrides,public.customers,public.appointments,public.waitlist_entries,public.reviews,public.payments,public.notifications,public.audit_logs,public.payment_accounts,public.support_tickets from anon,authenticated;

grant select on public.appointments to authenticated;

grant select on public.barber_services to anon;

grant delete on public.barber_services to authenticated;

grant insert on public.barber_services to authenticated;

grant select on public.barber_services to authenticated;

grant update on public.barber_services to authenticated;

grant select on public.barbers to anon;

grant delete on public.barbers to authenticated;

grant insert on public.barbers to authenticated;

grant select on public.barbers to authenticated;

grant update on public.barbers to authenticated;

grant select on public.barbershop_members to authenticated;

grant select on public.barbershops to anon;

grant delete on public.barbershops to authenticated;

grant insert on public.barbershops to authenticated;

grant select on public.barbershops to authenticated;

grant update on public.barbershops to authenticated;

grant select on public.customers to authenticated;

grant select on public.haircuts to anon;

grant delete on public.haircuts to authenticated;

grant insert on public.haircuts to authenticated;

grant select on public.haircuts to authenticated;

grant update on public.haircuts to authenticated;

grant select on public.notifications to authenticated;

grant select on public.payments to authenticated;

grant select on public.plans to authenticated;

grant select on public.profiles to authenticated;

grant select on public.reviews to anon;

grant select on public.reviews to authenticated;

grant delete on public.schedule_overrides to authenticated;

grant insert on public.schedule_overrides to authenticated;

grant select on public.schedule_overrides to authenticated;

grant update on public.schedule_overrides to authenticated;

grant select on public.services to anon;

grant delete on public.services to authenticated;

grant insert on public.services to authenticated;

grant select on public.services to authenticated;

grant update on public.services to authenticated;

grant delete on public.time_blocks to authenticated;

grant insert on public.time_blocks to authenticated;

grant select on public.time_blocks to authenticated;

grant update on public.time_blocks to authenticated;

grant select on public.waitlist_entries to authenticated;

grant select on public.working_hours to anon;

grant delete on public.working_hours to authenticated;

grant insert on public.working_hours to authenticated;

grant select on public.working_hours to authenticated;

grant update on public.working_hours to authenticated;

-- Attach the already reviewed JSON-safe tenant/platform guards.

drop trigger if exists tenant_reparent_guard on public.appointments;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.audit_logs;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.barber_services;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.barber_services FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.barbers;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.barbers FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.barbershop_members;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.barbershop_members FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists shop_platform_field_guard on public.barbershops;
CREATE TRIGGER shop_platform_field_guard BEFORE UPDATE OF status, plan_id ON public.barbershops FOR EACH ROW EXECUTE FUNCTION private.prevent_shop_platform_field_change();

drop trigger if exists tenant_reparent_guard on public.barbershops;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.barbershops FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.customers;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.haircuts;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.haircuts FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.notifications;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.payment_accounts;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.payments;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists platform_admin_flag_guard on public.profiles;
CREATE TRIGGER platform_admin_flag_guard BEFORE UPDATE OF is_platform_admin ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.prevent_platform_admin_escalation();

drop trigger if exists tenant_reparent_guard on public.reviews;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.schedule_overrides;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.schedule_overrides FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.services;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.support_tickets;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.time_blocks;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.time_blocks FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.waitlist_entries;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.waitlist_entries FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

drop trigger if exists tenant_reparent_guard on public.working_hours;
CREATE TRIGGER tenant_reparent_guard BEFORE UPDATE ON public.working_hours FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_reparent();

revoke all on function private.prevent_platform_admin_escalation() from public,anon,authenticated;

revoke all on function private.prevent_shop_platform_field_change() from public,anon,authenticated;

revoke all on function private.prevent_tenant_reparent() from public,anon,authenticated;

revoke all on function public.get_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status public.appointment_status, p_search text, p_limit integer, p_offset integer) from public,anon,authenticated;
grant execute on function public.get_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status public.appointment_status, p_search text, p_limit integer, p_offset integer) to service_role;

grant execute on function public.get_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status public.appointment_status, p_search text, p_limit integer, p_offset integer) to authenticated;

revoke all on function public.get_dashboard_snapshot(p_shop uuid) from public,anon,authenticated;
grant execute on function public.get_dashboard_snapshot(p_shop uuid) to service_role;

grant execute on function public.get_dashboard_snapshot(p_shop uuid) to authenticated;

revoke all on function public.get_notification_metrics(p_shop uuid) from public,anon,authenticated;
grant execute on function public.get_notification_metrics(p_shop uuid) to service_role;

grant execute on function public.get_notification_metrics(p_shop uuid) to authenticated;

revoke all on function public.get_public_barbershop(p_slug text) from public,anon,authenticated;
grant execute on function public.get_public_barbershop(p_slug text) to service_role;

grant execute on function public.get_public_barbershop(p_slug text) to anon,authenticated;

revoke all on function public.get_review_by_token(p_token uuid) from public,anon,authenticated;
grant execute on function public.get_review_by_token(p_token uuid) to service_role;

revoke all on function public.list_members(p_shop uuid) from public,anon,authenticated;
grant execute on function public.list_members(p_shop uuid) to service_role;

grant execute on function public.list_members(p_shop uuid) to authenticated;

revoke all on function public.submit_review_by_token(p_token uuid, p_rating integer, p_comment text) from public,anon,authenticated;
grant execute on function public.submit_review_by_token(p_token uuid, p_rating integer, p_comment text) to service_role;

notify pgrst, 'reload schema';

-- The notifications screen reads operator-scoped RPCs. Do not retain the
-- unnecessary direct table grant from the historical cloud reconciliation.
revoke select on public.notifications from authenticated;
