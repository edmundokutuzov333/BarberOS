-- BarberOS Phase 12: Customer CRM.
-- Read/write boundaries for the operational customer record, tenant-scoped in PostgreSQL.
-- No direct authenticated DML is required for CRM writes; the booking engines retain their
-- SECURITY DEFINER ability to create/update customers during booking lifecycle operations.

create index if not exists customers_name_trgm_idx
  on public.customers using gin (lower(name) extensions.gin_trgm_ops);

create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone extensions.gin_trgm_ops);

create index if not exists customers_email_trgm_idx
  on public.customers using gin (lower(coalesce(email,'')) extensions.gin_trgm_ops);

create or replace function public.get_customer_metrics(
  p_shop uuid
)
returns table(
  total_customers bigint,
  customers_with_upcoming bigint,
  customers_visited_last_30d bigint,
  customers_with_no_shows bigint,
  returning_customers bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_barber_id uuid;
  v_is_barber boolean;
begin
  perform private.require_agenda_access(p_shop);

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (
      where exists (
        select 1
        from public.appointments a
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.starts_at >= now()
          and a.status in ('pending','confirmed','in_progress')
          and (not v_is_barber or a.barber_id=v_barber_id)
      )
    )::bigint,
    count(*) filter (
      where c.last_visit_at >= now() - interval '30 days'
    )::bigint,
    count(*) filter (where c.no_show_count > 0)::bigint,
    count(*) filter (where c.visits_count >= 2)::bigint
  from public.customers c
  where c.barbershop_id=p_shop
    and (
      not v_is_barber
      or exists (
        select 1
        from public.appointments a
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.barber_id=v_barber_id
      )
    );
end;
$function$;

create or replace function public.get_customers(
  p_shop uuid,
  p_search text default null,
  p_view text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  customer_id uuid,
  name text,
  phone text,
  email text,
  notes text,
  preferences jsonb,
  visits_count integer,
  no_show_count integer,
  last_visit_at timestamptz,
  next_appointment_at timestamptz,
  next_appointment_status public.appointment_status,
  last_service_name text,
  last_haircut_name text,
  total_spend_cents bigint,
  total_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
  v_view text := lower(btrim(coalesce(p_view,'all')));
  v_barber_id uuid;
  v_is_barber boolean;
begin
  perform private.require_agenda_access(p_shop);

  if v_view not in ('all','upcoming','no_show','never_visited') then
    raise exception 'INVALID_CUSTOMER_VIEW';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  return query
  with visible as (
    select c.*,
      (
        select a.starts_at
        from public.appointments a
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.starts_at >= now()
          and a.status in ('pending','confirmed','in_progress')
          and (not v_is_barber or a.barber_id=v_barber_id)
        order by a.starts_at
        limit 1
      ) as upcoming_at,
      (
        select a.status
        from public.appointments a
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.starts_at >= now()
          and a.status in ('pending','confirmed','in_progress')
          and (not v_is_barber or a.barber_id=v_barber_id)
        order by a.starts_at
        limit 1
      ) as upcoming_status,
      (
        select s.name
        from public.appointments a
        join public.services s on s.id=a.service_id
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.status='completed'
          and (not v_is_barber or a.barber_id=v_barber_id)
        order by a.starts_at desc
        limit 1
      ) as last_service,
      (
        select h.name
        from public.appointments a
        left join public.haircuts h on h.id=a.haircut_id
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.status='completed'
          and h.id is not null
          and (not v_is_barber or a.barber_id=v_barber_id)
        order by a.starts_at desc
        limit 1
      ) as last_haircut,
      (
        select coalesce(sum(a.price_cents),0)::bigint
        from public.appointments a
        where a.barbershop_id=c.barbershop_id
          and a.customer_id=c.id
          and a.status='completed'
          and (not v_is_barber or a.barber_id=v_barber_id)
      ) as spend
    from public.customers c
    where c.barbershop_id=p_shop
      and (
        not v_is_barber
        or exists (
          select 1
          from public.appointments a
          where a.barbershop_id=c.barbershop_id
            and a.customer_id=c.id
            and a.barber_id=v_barber_id
        )
      )
      and (
        v_search is null
        or c.name ilike '%' || v_search || '%'
        or c.phone ilike '%' || v_search || '%'
        or coalesce(c.email,'') ilike '%' || v_search || '%'
      )
  ),
  filtered as (
    select *
    from visible
    where
      v_view='all'
      or (v_view='upcoming' and upcoming_at is not null)
      or (v_view='no_show' and no_show_count > 0)
      or (v_view='never_visited' and visits_count=0)
  )
  select
    f.id,
    f.name,
    f.phone,
    f.email,
    f.notes,
    f.preferences,
    f.visits_count,
    f.no_show_count,
    f.last_visit_at,
    f.upcoming_at,
    f.upcoming_status,
    f.last_service,
    f.last_haircut,
    f.spend,
    count(*) over()::bigint
  from filtered f
  order by
    (f.upcoming_at is not null) desc,
    coalesce(f.last_visit_at, f.created_at) desc,
    lower(f.name),
    f.id
  limit v_limit
  offset v_offset;
end;
$function$;

create or replace function public.get_customer(
  p_shop uuid,
  p_customer uuid
)
returns table(
  customer_id uuid,
  name text,
  phone text,
  email text,
  notes text,
  preferences jsonb,
  visits_count integer,
  no_show_count integer,
  last_visit_at timestamptz,
  next_appointment_at timestamptz,
  next_appointment_status public.appointment_status,
  last_service_name text,
  last_haircut_name text,
  last_barber_name text,
  total_spend_cents bigint,
  total_appointments bigint,
  completed_appointments bigint,
  cancelled_appointments bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_barber_id uuid;
  v_is_barber boolean;
begin
  perform private.require_agenda_access(p_shop);

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  return query
  select
    c.id,
    c.name,
    c.phone,
    c.email,
    c.notes,
    c.preferences,
    c.visits_count,
    c.no_show_count,
    c.last_visit_at,
    (
      select a.starts_at
      from public.appointments a
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.starts_at >= now()
        and a.status in ('pending','confirmed','in_progress')
        and (not v_is_barber or a.barber_id=v_barber_id)
      order by a.starts_at
      limit 1
    ),
    (
      select a.status
      from public.appointments a
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.starts_at >= now()
        and a.status in ('pending','confirmed','in_progress')
        and (not v_is_barber or a.barber_id=v_barber_id)
      order by a.starts_at
      limit 1
    ),
    (
      select s.name
      from public.appointments a
      join public.services s on s.id=a.service_id
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.status='completed'
        and (not v_is_barber or a.barber_id=v_barber_id)
      order by a.starts_at desc
      limit 1
    ),
    (
      select h.name
      from public.appointments a
      join public.haircuts h on h.id=a.haircut_id
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.status='completed'
        and h.id is not null
        and (not v_is_barber or a.barber_id=v_barber_id)
      order by a.starts_at desc
      limit 1
    ),
    (
      select b.display_name
      from public.appointments a
      join public.barbers b on b.id=a.barber_id
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.status='completed'
        and (not v_is_barber or a.barber_id=v_barber_id)
      order by a.starts_at desc
      limit 1
    ),
    (
      select coalesce(sum(a.price_cents),0)::bigint
      from public.appointments a
      where a.barbershop_id=c.barbershop_id
        and a.customer_id=c.id
        and a.status='completed'
        and (not v_is_barber or a.barber_id=v_barber_id)
    ),
    count(a.id)::bigint,
    count(a.id) filter (where a.status='completed')::bigint,
    count(a.id) filter (where a.status='cancelled')::bigint
  from public.customers c
  left join public.appointments a
    on a.barbershop_id=c.barbershop_id
   and a.customer_id=c.id
   and (not v_is_barber or a.barber_id=v_barber_id)
  where c.id=p_customer
    and c.barbershop_id=p_shop
    and (
      not v_is_barber
      or exists (
        select 1
        from public.appointments own_a
        where own_a.barbershop_id=c.barbershop_id
          and own_a.customer_id=c.id
          and own_a.barber_id=v_barber_id
      )
    )
  group by
    c.id,c.name,c.phone,c.email,c.notes,c.preferences,
    c.visits_count,c.no_show_count,c.last_visit_at,c.created_at,c.barbershop_id;

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
end;
$function$;

create or replace function public.get_customer_appointments(
  p_shop uuid,
  p_customer uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  appointment_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  service_name text,
  haircut_name text,
  barber_name text,
  price_cents integer,
  source public.booking_source,
  deposit_status public.deposit_state,
  deposit_cents integer,
  total_count bigint
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_barber_id uuid;
  v_is_barber boolean;
begin
  perform private.require_agenda_access(p_shop);

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.id=p_customer
      and c.barbershop_id=p_shop
      and (
        not v_is_barber
        or exists (
          select 1
          from public.appointments own_a
          where own_a.barbershop_id=p_shop
            and own_a.customer_id=p_customer
            and own_a.barber_id=v_barber_id
        )
      )
  ) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  return query
  select
    a.id,
    a.starts_at,
    a.ends_at,
    a.status,
    s.name,
    h.name,
    b.display_name,
    a.price_cents,
    a.source,
    a.deposit_status,
    a.deposit_cents,
    count(*) over()::bigint
  from public.appointments a
  join public.services s on s.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  where a.barbershop_id=p_shop
    and a.customer_id=p_customer
    and (not v_is_barber or a.barber_id=v_barber_id)
  order by a.starts_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

create or replace function public.update_customer(
  p_shop uuid,
  p_customer uuid,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_preferences jsonb default '{}'::jsonb
)
returns table(
  customer_id uuid,
  name text,
  phone text,
  email text,
  notes text,
  preferences jsonb,
  visits_count integer,
  no_show_count integer,
  last_visit_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_barber_id uuid;
  v_is_barber boolean;
  v_phone text;
  v_email text;
  v_notes text;
  v_preferences jsonb;
  v_old_name text;
  v_old_phone text;
  v_old_email text;
  v_old_notes text;
  v_old_preferences jsonb;
begin
  perform private.require_agenda_access(p_shop);

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

  v_notes := nullif(btrim(p_notes),'');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'CUSTOMER_NOTES_TOO_LONG';
  end if;

  v_preferences := coalesce(p_preferences,'{}'::jsonb);
  if jsonb_typeof(v_preferences) <> 'object' or pg_column_size(v_preferences) > 8192 then
    raise exception 'INVALID_CUSTOMER_PREFERENCES';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  select c.name,c.phone,c.email,c.notes,c.preferences
  into v_old_name,v_old_phone,v_old_email,v_old_notes,v_old_preferences
  from public.customers c
  where c.id=p_customer
    and c.barbershop_id=p_shop
    and (
      not v_is_barber
      or exists (
        select 1
        from public.appointments a
        where a.barbershop_id=p_shop
          and a.customer_id=p_customer
          and a.barber_id=v_barber_id
      )
    );

  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  begin
    update public.customers c
    set name=btrim(p_name),
        phone=v_phone,
        email=v_email,
        notes=v_notes,
        preferences=v_preferences
    where c.id=p_customer
      and c.barbershop_id=p_shop;
  exception
    when unique_violation then
      raise exception 'CUSTOMER_PHONE_TAKEN';
  end;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values (
    p_shop,auth.uid(),'customer_updated','customer',p_customer,
    jsonb_build_object(
      'phone_changed',(v_phone is distinct from v_old_phone),
      'name_changed',(btrim(p_name) is distinct from v_old_name),
      'email_changed',(v_email is distinct from v_old_email),
      'notes_changed',(v_notes is distinct from v_old_notes),
      'preferences_changed',(v_preferences is distinct from v_old_preferences)
    )
  );

  return query
  select c.id,c.name,c.phone,c.email,c.notes,c.preferences,c.visits_count,c.no_show_count,c.last_visit_at
  from public.customers c
  where c.id=p_customer
    and c.barbershop_id=p_shop;
end;
$function$;

revoke all on function public.get_customer_metrics(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_metrics(uuid) to authenticated;

revoke all on function public.get_customers(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_customers(uuid,text,text,integer,integer) to authenticated;

revoke all on function public.get_customer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_customer(uuid,uuid) to authenticated;

revoke all on function public.get_customer_appointments(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.get_customer_appointments(uuid,uuid,integer,integer) to authenticated;

revoke all on function public.update_customer(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.update_customer(uuid,uuid,text,text,text,text,jsonb) to authenticated;

revoke insert, update, delete on public.customers from anon,authenticated;

comment on function public.get_customer_metrics(uuid)
is 'Tenant-scoped CRM metrics for shop operators. Barbers only see customers linked to their own appointments.';

comment on function public.get_customers(uuid,text,text,integer,integer)
is 'Tenant-scoped customer list for the operational CRM. Search and filter are executed in PostgreSQL.';

comment on function public.get_customer(uuid,uuid)
is 'Tenant-scoped customer profile with appointment-derived operational metrics.';

comment on function public.get_customer_appointments(uuid,uuid,integer,integer)
is 'Tenant-scoped customer appointment history.';

comment on function public.update_customer(uuid,uuid,text,text,text,text,jsonb)
is 'Tenant-scoped CRM profile update. Phone uniqueness and validation are enforced in PostgreSQL.';
