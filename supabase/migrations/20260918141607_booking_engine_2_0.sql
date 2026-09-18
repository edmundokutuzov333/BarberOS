
-- BarberOS Phase 5: Booking Engine 2.0
-- Atomic online booking, strict domain validation, concurrency semantics,
-- notification queueing and immutable audit trail.

create or replace function public.enqueue_appointment_notifications(p_appt uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  a public.appointments%rowtype;
  v_phone text;
  v_email text;
  v_template text;
begin
  select * into a
  from public.appointments
  where id=p_appt;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  select c.phone,c.email
  into v_phone,v_email
  from public.customers c
  where c.id=a.customer_id
    and c.barbershop_id=a.barbershop_id;

  v_template := case
    when a.status='pending' then 'appointment_pending'
    else 'appointment_confirmed'
  end;

  if v_phone is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values (
      a.barbershop_id,a.id,'whatsapp',v_template,v_phone,now(),
      jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id)
    );
  end if;

  if a.starts_at - interval '24 hours' > now() and v_phone is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values (
      a.barbershop_id,a.id,'whatsapp','reminder_24h',v_phone,
      a.starts_at-interval '24 hours',
      jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id)
    );
  end if;

  if a.starts_at - interval '1 hour' > now() and v_phone is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values (
      a.barbershop_id,a.id,'whatsapp','reminder_1h',v_phone,
      a.starts_at-interval '1 hour',
      jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id)
    );
  end if;

  if v_email is not null then
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values (
      a.barbershop_id,a.id,'email',v_template,v_email,now(),
      jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id)
    );
  end if;
end;
$$;

create or replace function public.on_appointment_completed()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_phone text;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());

    select c.phone into v_phone
    from public.customers c
    where c.id=new.customer_id
      and c.barbershop_id=new.barbershop_id;

    if v_phone is not null then
      insert into public.notifications(
        barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
      )
      values (
        new.barbershop_id,new.id,'whatsapp','review_request',v_phone,
        new.completed_at+interval '1 hour',
        jsonb_build_object('manage_token',new.manage_token,'appointment_id',new.id)
      );
    end if;

    update public.customers
    set visits_count=visits_count+1,
        last_visit_at=new.completed_at
    where id=new.customer_id
      and barbershop_id=new.barbershop_id;
  end if;

  if new.status='no_show' and old.status is distinct from 'no_show' then
    new.no_show_at := coalesce(new.no_show_at, now());

    update public.customers
    set no_show_count=no_show_count+1
    where id=new.customer_id
      and barbershop_id=new.barbershop_id;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_completed on public.appointments;
create trigger appointments_completed
before update of status on public.appointments
for each row execute function public.on_appointment_completed();

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
language plpgsql
security definer
set search_path=''
as $$
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

  if v_phone !~ '^\+?258?8[2-7][0-9]{7}$' then
    raise exception 'INVALID_PHONE';
  end if;

  if v_phone like '+258%' then
    v_phone := v_phone;
  elsif v_phone like '258%' then
    v_phone := '+' || v_phone;
  else
    v_phone := '+258' || v_phone;
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
    returning id,manage_token
    into v_id,v_tok;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
  end;

  perform public.enqueue_appointment_notifications(v_id);

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values (
    v_shop.id,auth.uid(),'appointment_created','appointment',v_id,
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
$$;

revoke all on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)
  from public,anon,authenticated;
grant execute on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)
  to anon,authenticated;

revoke all on function public.enqueue_appointment_notifications(uuid)
  from public,anon,authenticated;

comment on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)
is 'Atomic public online booking: validates tenant relations, rechecks availability under barber advisory lock, relies on exclusion constraint as final overlap barrier, creates customer/appointment, queues notifications and audits the booking.';
