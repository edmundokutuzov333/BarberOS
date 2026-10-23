-- Remove the dedicated Phase 23 fixture and all dependent test rows.
begin;

do $phase23_cleanup$
declare
  v_shop uuid;
  v_user uuid;
  v_appointments uuid[];
  r record;
begin
  select id into v_shop
  from public.barbershops
  where slug = 'phase23-acceptance-fixture';

  if v_shop is null then
    return;
  end if;

  select id into v_user
  from auth.users
  where email = 'phase23-owner@example.invalid';

  select array_agg(id) into v_appointments
  from public.appointments
  where barbershop_id = v_shop;

  if coalesce(array_length(v_appointments, 1), 0) > 0 then
    for r in
      select distinct tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_schema = tc.constraint_schema
       and kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_schema = tc.constraint_schema
       and ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ccu.table_schema = 'public'
        and ccu.table_name = 'appointments'
        and tc.table_name <> 'appointments'
    loop
      execute format('delete from public.%I where %I = any($1)', r.table_name, r.column_name)
      using v_appointments;
    end loop;
  end if;

  for r in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'barbershop_id'
      and table_name not in (
        'barbershops','appointments','barbers','services','haircuts',
        'customers','working_hours','barbershop_members'
      )
    order by table_name
  loop
    execute format('delete from public.%I where barbershop_id = $1', r.table_name)
    using v_shop;
  end loop;

  delete from public.appointments where barbershop_id = v_shop;
  delete from public.barber_services
  where barber_id in (select id from public.barbers where barbershop_id = v_shop)
     or service_id in (select id from public.services where barbershop_id = v_shop);
  delete from public.working_hours where barbershop_id = v_shop;
  delete from public.haircuts where barbershop_id = v_shop;
  delete from public.services where barbershop_id = v_shop;
  delete from public.barbers where barbershop_id = v_shop;
  delete from public.customers where barbershop_id = v_shop;
  delete from public.barbershop_members where barbershop_id = v_shop;
  delete from public.barbershops where id = v_shop;

  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;
end;
$phase23_cleanup$;

commit;
