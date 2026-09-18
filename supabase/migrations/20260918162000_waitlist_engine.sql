-- BarberOS Phase 13: Waitlist Engine
-- Queue semantics, slot-scoped offers, public claim flow and operator management.

create index if not exists waitlist_waiting_lookup_idx
  on public.waitlist_entries(barbershop_id, status, service_id, created_at);

create index if not exists waitlist_offer_lookup_idx
  on public.waitlist_entries(offer_token)
  where offer_token is not null;

create unique index if not exists waitlist_one_active_offer_per_slot_idx
  on public.waitlist_entries(barbershop_id, offer_slot_start)
  where status='offered' and offer_slot_start is not null;

create unique index if not exists waitlist_offer_token_unique_idx
  on public.waitlist_entries(offer_token)
  where offer_token is not null;

revoke all on public.waitlist_entries from anon, authenticated;

create or replace function private.waitlist_period_matches(
  p_period text,
  p_slot_start timestamptz,
  p_timezone text
)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select case
    when p_period='any' then true
    when p_period='morning' then extract(hour from p_slot_start at time zone p_timezone) < 12
    when p_period='afternoon' then extract(hour from p_slot_start at time zone p_timezone) >= 12
      and extract(hour from p_slot_start at time zone p_timezone) < 17
    when p_period='evening' then extract(hour from p_slot_start at time zone p_timezone) >= 17
    else false
  end;
$function$;

create or replace function private.offer_next_waitlist_core(
  p_shop uuid,
  p_slot_start timestamptz,
  p_barber_id uuid
)
returns table(
  waitlist_entry_id uuid,
  offer_token uuid,
  offer_expires_at timestamptz,
  customer_name text,
  phone text,
  email text,
  service_id uuid,
  haircut_id uuid,
  barber_id uuid,
  slot_start timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  sh public.barbershops%rowtype;
  w public.waitlist_entries%rowtype;
  v_date date;
  v_occupied boolean;
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

  -- Expire stale offers for this slot before choosing the next customer.
  update public.waitlist_entries
  set status='expired'
  where barbershop_id=p_shop
    and status='offered'
    and offer_slot_start=p_slot_start
    and offer_barber_id=p_barber_id
    and offer_expires_at <= now();

  -- Never offer the same physical slot twice.
  if exists (
    select 1
    from public.waitlist_entries
    where barbershop_id=p_shop
      and status='offered'
      and offer_slot_start=p_slot_start
      and offer_barber_id=p_barber_id
      and offer_expires_at > now()
  ) then
    return;
  end if;

  for w in
    select we.*
    from public.waitlist_entries we
    where we.barbershop_id=p_shop
      and we.status='waiting'
      and we.service_id in (
        select s.id
        from public.services s
        where s.id=we.service_id
          and s.barbershop_id=p_shop
          and s.is_active
      )
      and (we.barber_id is null or we.barber_id=p_barber_id)
      and (we.date_from is null or v_date >= we.date_from)
      and (we.date_to is null or v_date <= we.date_to)
      and private.waitlist_period_matches(we.period,p_slot_start,sh.timezone)
    order by we.created_at, we.id
    for update skip locked
  loop
    -- The candidate service may have a different duration from the released appointment.
    -- The same Availability Engine remains the source of truth for whether the candidate can use this slot.
    select exists (
      select 1
      from public.get_available_slots(
        sh.slug,
        w.service_id,
        p_barber_id,
        v_date
      ) av
      where av.slot_start=p_slot_start
    )
    into v_occupied;

    if v_occupied then
      v_offer_token := gen_random_uuid();
      v_expires := now() + interval '15 minutes';

      update public.waitlist_entries
      set status='offered',
          offer_token=v_offer_token,
          offer_slot_start=p_slot_start,
          offer_barber_id=p_barber_id,
          offer_expires_at=v_expires
      where id=w.id
      returning
        id,offer_token,offer_expires_at,customer_name,phone,email,
        service_id,haircut_id,p_barber_id,p_slot_start
      into
        waitlist_entry_id,offer_token,offer_expires_at,customer_name,phone,email,
        service_id,haircut_id,barber_id,slot_start;

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

create or replace function public.offer_next_waitlist(
  p_shop uuid,
  p_slot_start timestamptz,
  p_barber_id uuid
)
returns table(
  waitlist_entry_id uuid,
  offer_token uuid,
  offer_expires_at timestamptz,
  customer_name text,
  phone text,
  email text,
  service_id uuid,
  haircut_id uuid,
  barber_id uuid,
  slot_start timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_shop_operator(p_shop);
  return query
  select *
  from private.offer_next_waitlist_core(p_shop,p_slot_start,p_barber_id);
end;
$function$;

revoke all on function public.offer_next_waitlist(uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.offer_next_waitlist(uuid,timestamptz,uuid) to authenticated;

create or replace function public.join_waitlist(
  p_slug text,
  p_service_id uuid,
  p_haircut_id uuid default null,
  p_barber_id uuid default null,
  p_customer_name text,
  p_phone text,
  p_email text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_period text default 'any'
)
returns table(
  status public.waitlist_status,
  queued_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  sh public.barbershops%rowtype;
  svc public.services%rowtype;
  v_phone text;
  v_email text;
  v_from date;
  v_to date;
  v_period text;
  v_existing public.waitlist_entries%rowtype;
begin
  select * into sh
  from public.barbershops
  where slug=lower(btrim(p_slug))
    and status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select * into svc
  from public.services
  where id=p_service_id
    and barbershop_id=sh.id
    and is_active;

  if not found then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  if p_haircut_id is not null and not exists (
    select 1
    from public.haircuts h
    where h.id=p_haircut_id
      and h.barbershop_id=sh.id
      and h.is_active
      and (h.service_id is null or h.service_id=p_service_id)
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

  if p_customer_name is null or length(btrim(p_customer_name)) < 2 or length(btrim(p_customer_name)) > 120 then
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
  if v_email is not null and (length(v_email) > 254 or position('@' in v_email) < 2) then
    raise exception 'INVALID_EMAIL';
  end if;

  v_from := coalesce(p_date_from,(now() at time zone sh.timezone)::date);
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

  select *
  into v_existing
  from public.waitlist_entries w
  where w.barbershop_id=sh.id
    and w.service_id=p_service_id
    and w.phone=v_phone
    and w.status in ('waiting','offered')
    and coalesce(w.barber_id,'00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_barber_id,'00000000-0000-0000-0000-000000000000'::uuid)
    and w.date_from=v_from
    and w.date_to=v_to
    and w.period=v_period
  order by w.created_at
  limit 1;

  if found then
    return query select v_existing.status,v_existing.created_at;
    return;
  end if;

  insert into public.waitlist_entries(
    barbershop_id,service_id,haircut_id,barber_id,
    customer_name,phone,email,date_from,date_to,period,status
  )
  values(
    sh.id,p_service_id,p_haircut_id,p_barber_id,
    btrim(p_customer_name),v_phone,v_email,v_from,v_to,v_period,'waiting'
  )
  returning waitlist_entries.status,waitlist_entries.created_at
  into status,queued_at;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,diff
  )
  values(
    sh.id,null,'waitlist_joined','waitlist_entry',
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

grant execute on function public.join_waitlist(text,uuid,uuid,uuid,text,text,text,date,date,text) to anon,authenticated;

create or replace function public.get_waitlist_offer(
  p_token uuid
)
returns table(
  status public.waitlist_status,
  can_claim boolean,
  customer_name text,
  service_name text,
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

revoke all on function public.get_waitlist_offer(uuid) from public,authenticated;
grant execute on function public.get_waitlist_offer(uuid) to anon;

create or replace function public.expire_waitlist_offer(
  p_token uuid
)
returns table(
  waitlist_entry_id uuid,
  status public.waitlist_status,
  next_offer_token uuid
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  w public.waitlist_entries%rowtype;
  v_next record;
begin
  select *
  into w
  from public.waitlist_entries
  where offer_token=p_token
  for update;

  if not found then
    raise exception 'WAITLIST_OFFER_NOT_FOUND';
  end if;

  if w.status <> 'offered' then
    return query select w.id,w.status,null::uuid;
    return;
  end if;

  if w.offer_expires_at is null or w.offer_expires_at > now() then
    raise exception 'WAITLIST_OFFER_STILL_ACTIVE';
  end if;

  update public.waitlist_entries
  set status='expired'
  where id=w.id;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values(
    w.barbershop_id,null,'waitlist_offer_expired','waitlist_entry',w.id,
    jsonb_build_object('slot_start',w.offer_slot_start,'barber_id',w.offer_barber_id)
  );

  select *
  into v_next
  from private.offer_next_waitlist_core(
    w.barbershop_id,
    w.offer_slot_start,
    w.offer_barber_id
  );

  return query
  select w.id,w.status,v_next.offer_token;
end;
$function$;

grant execute on function public.expire_waitlist_offer(uuid) to anon,authenticated;

create or replace function public.claim_waitlist_offer(
  p_token uuid
)
returns table(
  waitlist_entry_id uuid,
  appointment_id uuid,
  manage_token uuid,
  status public.appointment_status,
  starts_at timestamptz,
  ends_at timestamptz,
  barber_id uuid,
  deposit_cents integer,
  needs_payment boolean
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  w public.waitlist_entries%rowtype;
  sh public.barbershops%rowtype;
  r record;
  v_error text;
begin
  select * into w
  from public.waitlist_entries
  where offer_token=p_token
  for update;

  if not found then
    raise exception 'WAITLIST_OFFER_NOT_FOUND';
  end if;

  if w.status <> 'offered' then
    raise exception 'WAITLIST_OFFER_NOT_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'waitlist-slot:' || w.barbershop_id::text || ':' || w.offer_barber_id::text || ':' || w.offer_slot_start::text,
      0
    )
  );

  select * into w
  from public.waitlist_entries
  where id=w.id
  for update;

  if w.offer_expires_at is null or w.offer_expires_at <= now() then
    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_OFFER_EXPIRED';
  end if;

  select * into sh
  from public.barbershops
  where id=w.barbershop_id
    and status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  begin
    select *
    into r
    from private.book_appointment_core(
      sh.slug,
      w.service_id,
      w.haircut_id,
      w.offer_barber_id,
      w.offer_slot_start,
      w.customer_name,
      w.phone,
      w.email,
      'waitlist'::public.booking_source,
      null,
      'Waitlist claim'
    );

    update public.waitlist_entries
    set status='converted'
    where id=w.id;

    update public.notifications
    set status='skipped',
        error='waitlist_converted'
    where waitlist_entry_id=w.id
      and status='queued'
      and template_key='waitlist_offer';

    insert into public.audit_logs(
      barbershop_id,actor_id,action,entity,entity_id,diff
    )
    values(
      w.barbershop_id,auth.uid(),'waitlist_converted','waitlist_entry',w.id,
      jsonb_build_object('appointment_id',r.appointment_id,'slot_start',w.offer_slot_start)
    );

    return query
    select
      w.id,
      r.appointment_id,
      r.manage_token,
      (
        select a.status
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.starts_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.ends_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      w.offer_barber_id,
      r.deposit_cents,
      r.needs_payment;
    return;
  exception
    when others then
      v_error := sqlerrm;
  end;

  if position('SLOT_TAKEN' in coalesce(v_error,'')) > 0
     or position('SLOT_UNAVAILABLE' in coalesce(v_error,'')) > 0 then
    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_SLOT_TAKEN';
  end if;

  raise exception '%',v_error;
end;
$function$;

grant execute on function public.claim_waitlist_offer(uuid) to anon,authenticated;

create or replace function public.get_waitlist(
  p_shop uuid,
  p_status text default 'active',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  waitlist_entry_id uuid,
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
  select
    w.id,
    w.customer_name,
    w.phone,
    w.email,
    s.name,
    h.name,
    b.display_name,
    w.date_from,
    w.date_to,
    w.period,
    w.status,
    w.offer_slot_start,
    ob.display_name,
    w.offer_expires_at,
    w.created_at,
    count(*) over()::bigint
  from public.waitlist_entries w
  join public.services s on s.id=w.service_id
  left join public.haircuts h on h.id=w.haircut_id
  left join public.barbers b on b.id=w.barber_id
  left join public.barbers ob on ob.id=w.offer_barber_id
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
  order by
    case w.status when 'offered' then 0 when 'waiting' then 1 else 2 end,
    w.created_at,
    w.id
  limit v_limit
  offset v_offset;
end;
$function$;

revoke all on function public.get_waitlist(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_waitlist(uuid,text,text,integer,integer) to authenticated;

create or replace function public.cancel_waitlist(
  p_shop uuid,
  p_entry uuid
)
returns table(
  waitlist_entry_id uuid,
  status public.waitlist_status
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  w public.waitlist_entries%rowtype;
begin
  perform private.require_shop_operator(p_shop);

  select * into w
  from public.waitlist_entries
  where id=p_entry
    and barbershop_id=p_shop
  for update;

  if not found then
    raise exception 'WAITLIST_NOT_FOUND';
  end if;

  if w.status in ('converted','cancelled','expired') then
    return query select w.id,w.status;
    return;
  end if;

  update public.waitlist_entries
  set status='cancelled'
  where id=w.id;

  update public.notifications
  set status='skipped',
      error='waitlist_cancelled'
  where waitlist_entry_id=w.id
    and status='queued';

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id
  )
  values(
    p_shop,auth.uid(),'waitlist_cancelled','waitlist_entry',w.id
  );

  return query select w.id,'cancelled'::public.waitlist_status;
end;
$function$;

revoke all on function public.cancel_waitlist(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_waitlist(uuid,uuid) to authenticated;

comment on function public.offer_next_waitlist(uuid,timestamptz,uuid)
is 'Offers one eligible waiting customer the released slot. Protected by a slot advisory lock and a unique active-offer index.';

comment on function public.join_waitlist(text,uuid,uuid,uuid,text,text,text,date,date,text)
is 'Public no-account waitlist entry. Validates tenant, service, optional haircut/barber, date range, period and Mozambican phone.';

comment on function public.claim_waitlist_offer(uuid)
is 'Public token claim. Revalidates the slot through the booking engine before converting the waitlist entry into an appointment.';

comment on function public.expire_waitlist_offer(uuid)
is 'Expires a lapsed waitlist offer and immediately rotates the same slot to the next eligible customer.';

comment on function public.get_waitlist_offer(uuid)
is 'Public token-scoped offer view with no appointment or customer internal identifiers.';

comment on function public.get_waitlist(uuid,text,text,integer,integer)
is 'Tenant-scoped operator waitlist list with search, status filters and pagination.';
