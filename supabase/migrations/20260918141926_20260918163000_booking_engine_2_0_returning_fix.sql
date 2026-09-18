-- BarberOS Phase 5 patch: disambiguate appointment output parameter names.
CREATE OR REPLACE FUNCTION public.book_appointment(p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text DEFAULT NULL::text)
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
begin
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

  if v_phone !~ '^\+2588[2-7][0-9]{7}$' then
    raise exception 'INVALID_PHONE';
  end if;

  v_email := nullif(lower(btrim(p_email)),'');
  if v_email is not null and (length(v_email) > 254 or position('@' in v_email) < 2) then
    raise exception 'INVALID_EMAIL';
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
      'online',
      null,
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
    auth.uid(),
    'appointment_created',
    'appointment',
    v_id,
    jsonb_build_object(
      'source','online',
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
$function$

