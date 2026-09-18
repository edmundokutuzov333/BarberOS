-- BarberOS Phase 12 patch: resolve get_customers return-variable ambiguity.
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
      or (v_view='no_show' and visible.no_show_count > 0)
      or (v_view='never_visited' and visible.visits_count=0)
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

revoke all on function public.get_customers(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_customers(uuid,text,text,integer,integer) to authenticated;
