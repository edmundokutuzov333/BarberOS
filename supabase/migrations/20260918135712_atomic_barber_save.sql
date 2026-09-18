
-- BarberOS Phase 3: atomic barber aggregate save
create or replace function public.save_barber(
  p_shop uuid,
  p_barber_id uuid,
  p_display_name text,
  p_bio text,
  p_years_experience integer,
  p_photo_url text,
  p_user_id uuid,
  p_service_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_barber_id uuid;
  v_service_count int;
  v_distinct_service_count int;
begin
  perform private.require_shop_operator(p_shop);

  if p_display_name is null or length(btrim(p_display_name)) < 2 then
    raise exception 'INVALID_BARBER_NAME';
  end if;

  if p_years_experience < 0 or p_years_experience > 80 then
    raise exception 'INVALID_BARBER_EXPERIENCE';
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.barbershop_members m
    where m.barbershop_id=p_shop
      and m.user_id=p_user_id
  ) then
    raise exception 'BARBER_USER_NOT_MEMBER';
  end if;

  v_service_count := coalesce(array_length(p_service_ids,1),0);
  v_distinct_service_count := coalesce(
    (select count(distinct x) from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(x)),
    0
  );

  if v_service_count <> v_distinct_service_count then
    raise exception 'DUPLICATE_SERVICE';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(id)
    left join public.services s on s.id=u.id
    where s.id is null or s.barbershop_id<>p_shop
  ) then
    raise exception 'SERVICE_NOT_IN_SHOP';
  end if;

  if p_barber_id is null then
    insert into public.barbers(
      barbershop_id,
      display_name,
      bio,
      years_experience,
      photo_url,
      user_id,
      sort_order
    )
    values (
      p_shop,
      btrim(p_display_name),
      nullif(btrim(p_bio),''),
      p_years_experience,
      p_photo_url,
      p_user_id,
      (select coalesce(max(sort_order)+1,0) from public.barbers where barbershop_id=p_shop)
    )
    returning id into v_barber_id;
  else
    if not exists (
      select 1 from public.barbers b
      where b.id=p_barber_id
        and b.barbershop_id=p_shop
    ) then
      raise exception 'BARBER_NOT_IN_SHOP';
    end if;

    update public.barbers
    set display_name=btrim(p_display_name),
        bio=nullif(btrim(p_bio),''),
        years_experience=p_years_experience,
        photo_url=p_photo_url,
        user_id=p_user_id
    where id=p_barber_id
      and barbershop_id=p_shop
    returning id into v_barber_id;
  end if;

  delete from public.barber_services
  where barber_id=v_barber_id;

  insert into public.barber_services(barber_id,service_id)
  select v_barber_id,u.id
  from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(id);

  return v_barber_id;
end;
$$;

revoke all on function public.save_barber(uuid,uuid,text,text,integer,text,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.save_barber(uuid,uuid,text,text,integer,text,uuid,uuid[]) to authenticated;

comment on function public.save_barber(uuid,uuid,text,text,integer,text,uuid,uuid[]) is
  'Atomically creates or updates one barber and its complete service association set within one barbershop.';
