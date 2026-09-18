-- BarberOS Phase 11 patch: make unified booking MSISDN validation independent of regex escaping.
-- BarberOS Phase 11: manual appointment booking on the same atomic booking engine.
-- Online and manual booking now converge on one private transactional core.
-- Manual booking is an authenticated operator boundary only.

create or replace function private.book_appointment_core(
  p_slug text,
  p_service_id uuid,
  p_haircut_id uuid,
  p_barber_id uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_email text,
  p_source public.booking_source,
  p_created_by uuid default null,
  p_internal_note text default null
)
returns table(
  appointment_id uuid,
  manage_token uuid,
  deposit_cents int,
  needs_payment boolean
)
language plpgsql
security definer
set search_path=''
as $function$
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
    and is_active;

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
      and (service_id is null or service_id=p_service_id);

    if not found then
      raise exception 'HAIRCUT_NOT_FOUND';
    end if;
  end if;

  v_slot_date := (p_start at time zone v_shop.timezone)::date;

  if p_barber_id is null then
    select (s.barber_ids)[1]
    into v_barber
    from public.get_available_slots(
      btrim(p_slug),p_service_id,null,v_slot_date
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
    from public.get_available_slots(
      btrim(p_slug),p_service_id,v_barber,v_slot_date
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

create or replace function public.book_appointment(
  p_slug text,
  p_service_id uuid,
  p_haircut_id uuid,
  p_barber_id uuid,
  p_start timestamptz,
  p_name text,
  p_phone text,
  p_email text default null
)
returns table(
  appointment_id uuid,
  manage_token uuid,
  deposit_cents int,
  needs_payment boolean
)
language sql
security definer
set search_path=''
as $function$
  select *
  from private.book_appointment_core(
    p_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email,
    'online'::public.booking_source,
    null,
    null
  );
$function$;

create or replace function public.book_appointment_manual(
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

  select b.slug
  into v_slug
  from public.barbershops b
  where b.id=p_shop;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select *
  into v_result
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
  select v_result.appointment_id,
         v_result.manage_token,
         v_result.deposit_cents,
         v_result.needs_payment;
end;
$function$;

revoke all on function private.book_appointment_core(text,uuid,uuid,uuid,timestamptz,text,text,text,public.booking_source,uuid,text)
  from public,anon,authenticated;

revoke all on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)
  to anon,authenticated;

revoke all on function public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)
  to authenticated;

comment on function public.book_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text)
is 'Operator manual booking. Uses the same private atomic booking core as online booking, enforces tenant/operator scope, records source=manual and created_by=auth.uid(), and keeps direct appointment DML blocked.';
