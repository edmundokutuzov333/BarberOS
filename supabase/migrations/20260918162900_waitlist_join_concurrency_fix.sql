-- BarberOS Phase 13 patch: serialize identical public waitlist joins.
-- The active-entry dedupe is now concurrency-safe without introducing a schema-specific
-- expression index for nullable barber/date fields.

create or replace function public.join_waitlist(
  p_slug text,
  p_service_id uuid,
  p_customer_name text,
  p_phone text,
  p_haircut_id uuid default null,
  p_barber_id uuid default null,
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

revoke all on function public.join_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text)
from public,anon,authenticated;

grant execute on function public.join_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text)
to anon,authenticated;

comment on function public.join_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text)
is 'Public no-account waitlist entry with concurrency-safe dedupe keyed by shop, service, normalized phone, barber, date range and period.';
