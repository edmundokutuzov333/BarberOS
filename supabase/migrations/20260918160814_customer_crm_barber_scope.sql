-- BarberOS Phase 12 patch: scope customer metrics to the operator role.
create or replace function public.get_customer_metrics(p_shop uuid)
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
      where (
        (not v_is_barber and c.last_visit_at >= now() - interval '30 days')
        or
        (v_is_barber and exists (
          select 1
          from public.appointments a
          where a.barbershop_id=c.barbershop_id
            and a.customer_id=c.id
            and a.status='completed'
            and a.barber_id=v_barber_id
            and a.completed_at >= now() - interval '30 days'
        ))
      )
    )::bigint,
    count(*) filter (
      where (
        (not v_is_barber and c.no_show_count > 0)
        or
        (v_is_barber and exists (
          select 1
          from public.appointments a
          where a.barbershop_id=c.barbershop_id
            and a.customer_id=c.id
            and a.status='no_show'
            and a.barber_id=v_barber_id
        ))
      )
    )::bigint,
    count(*) filter (
      where (
        (not v_is_barber and c.visits_count >= 2)
        or
        (v_is_barber and (
          select count(*)
          from public.appointments a
          where a.barbershop_id=c.barbershop_id
            and a.customer_id=c.id
            and a.status='completed'
            and a.barber_id=v_barber_id
        ) >= 2)
      )
    )::bigint
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

revoke all on function public.get_customer_metrics(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_metrics(uuid) to authenticated;
