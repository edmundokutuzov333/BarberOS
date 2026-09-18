-- BarberOS — motor de disponibilidade, marcação, catálogo e membros
create or replace function public.get_available_slots(
  p_slug text, p_service_id uuid, p_barber_id uuid default null, p_date date default current_date)
returns table(slot_start timestamptz, barber_ids uuid[])
language plpgsql stable security definer set search_path=public as $$
declare v_shop barbershops%rowtype; v_dur int; v_step int; v_lead int; v_tz text;
begin
  select * into v_shop from barbershops where slug=p_slug and status in ('active','trial');
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;

  select duration_min into v_dur from services
   where id=p_service_id and barbershop_id=v_shop.id and is_active;
  if v_dur is null then raise exception 'SERVICE_NOT_FOUND'; end if;

  v_step:=v_shop.slot_interval_min; v_lead:=v_shop.min_lead_time_min; v_tz:=v_shop.timezone;
  if p_date > (now() at time zone v_tz)::date + v_shop.max_advance_days then return; end if;

  return query
  with candidates as (
    select b.id from barbers b
    join barber_services bs on bs.barber_id=b.id and bs.service_id=p_service_id
    where b.barbershop_id=v_shop.id and b.is_active
      and (p_barber_id is null or b.id=p_barber_id)
  ),
  windows as (
    select c.id as barber_id,
           ((p_date::text||' '||wh.opens_at::text)::timestamp at time zone v_tz)  as win_start,
           ((p_date::text||' '||wh.closes_at::text)::timestamp at time zone v_tz) as win_end
    from candidates c
    join lateral (
      select * from working_hours w
      where w.barbershop_id=v_shop.id
        and w.weekday=extract(dow from p_date)::int
        and (w.barber_id=c.id or w.barber_id is null)
        and not w.is_closed
      order by (w.barber_id is not null) desc
      limit 1
    ) wh on true
  ),
  grid as (
    select w.barber_id, gs as s, gs+make_interval(mins=>v_dur) as e
    from windows w
    cross join lateral generate_series(
      w.win_start, w.win_end-make_interval(mins=>v_dur), make_interval(mins=>v_step)) gs
  )
  select g.s, array_agg(g.barber_id order by g.barber_id)
  from grid g
  where g.s >= now()+make_interval(mins=>v_lead)
    and not exists (select 1 from appointments a
      where a.barber_id=g.barber_id
        and a.status in ('pending','confirmed','in_progress')
        and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(g.s,g.e,'[)'))
    and not exists (select 1 from time_blocks tb
      where tb.barbershop_id=v_shop.id
        and (tb.barber_id is null or tb.barber_id=g.barber_id)
        and tstzrange(tb.starts_at,tb.ends_at,'[)') && tstzrange(g.s,g.e,'[)'))
  group by g.s order by g.s;
end $$;
grant execute on function public.get_available_slots(text,uuid,uuid,date) to anon, authenticated;

create or replace function public.get_available_days(
  p_slug text, p_service_id uuid, p_barber_id uuid default null,
  p_from date default current_date, p_to date default current_date+13)
returns table(day date, slots_count int, is_open boolean)
language plpgsql stable security definer set search_path=public as $$
declare v_shop barbershops%rowtype; d date;
begin
  select * into v_shop from barbershops where slug=p_slug and status in ('active','trial');
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  for d in select generate_series(p_from, least(p_to, p_from+60), interval '1 day')::date loop
    day := d;
    is_open := exists(select 1 from working_hours w where w.barbershop_id=v_shop.id
                      and w.weekday=extract(dow from d)::int and not w.is_closed);
    select count(*)::int into slots_count from get_available_slots(p_slug,p_service_id,p_barber_id,d);
    return next;
  end loop;
end $$;
grant execute on function public.get_available_days(text,uuid,uuid,date,date) to anon, authenticated;

create or replace function public.enqueue_appointment_notifications(p_appt uuid)
returns void language plpgsql security definer set search_path=public as $$
declare a appointments%rowtype; v_phone text; v_email text;
begin
  select * into a from appointments where id=p_appt;
  if not found then return; end if;
  select phone,email into v_phone,v_email from customers where id=a.customer_id;
  insert into notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
  values (a.barbershop_id,a.id,'whatsapp',
          case when a.status='pending' then 'appointment_pending' else 'appointment_confirmed' end,
          v_phone, now(), jsonb_build_object('manage_token',a.manage_token));
  if a.starts_at - interval '24 hours' > now() then
    insert into notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (a.barbershop_id,a.id,'whatsapp','reminder_24h',v_phone,a.starts_at-interval '24 hours',jsonb_build_object('manage_token',a.manage_token));
  end if;
  if a.starts_at - interval '1 hour' > now() then
    insert into notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (a.barbershop_id,a.id,'whatsapp','reminder_1h',v_phone,a.starts_at-interval '1 hour',jsonb_build_object('manage_token',a.manage_token));
  end if;
  if v_email is not null then
    insert into notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (a.barbershop_id,a.id,'email','appointment_confirmed',v_email,now(),jsonb_build_object('manage_token',a.manage_token));
  end if;
end $$;

-- pedido de avaliação 1h depois de concluir
create or replace function public.on_appointment_completed() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_phone text;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    select phone into v_phone from customers where id=new.customer_id;
    insert into notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (new.barbershop_id,new.id,'whatsapp','review_request',v_phone,new.completed_at+interval '1 hour',jsonb_build_object('manage_token',new.manage_token));
    update customers set visits_count=visits_count+1, last_visit_at=new.completed_at where id=new.customer_id;
  end if;
  if new.status='no_show' and old.status is distinct from 'no_show' then
    new.no_show_at := coalesce(new.no_show_at, now());
    update customers set no_show_count=no_show_count+1 where id=new.customer_id;
  end if;
  return new;
end $$;
drop trigger if exists appointments_completed on appointments;
create trigger appointments_completed before update of status on appointments
  for each row execute function public.on_appointment_completed();

create or replace function public.book_appointment(
  p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid,
  p_start timestamptz, p_name text, p_phone text, p_email text default null)
returns table(appointment_id uuid, manage_token uuid, deposit_cents int, needs_payment boolean)
language plpgsql security definer set search_path=public as $$
declare v_shop barbershops%rowtype; v_svc services%rowtype;
        v_barber uuid; v_end timestamptz; v_cust uuid; v_id uuid;
        v_tok uuid; v_dep int:=0; v_status appointment_status; v_dstate deposit_state;
begin
  if p_name is null or length(btrim(p_name))<2 then raise exception 'INVALID_NAME'; end if;
  if p_phone !~ '^\+?258?8[2-7][0-9]{7}$' then raise exception 'INVALID_PHONE'; end if;

  select * into v_shop from barbershops where slug=p_slug and status in ('active','trial');
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  select * into v_svc from services where id=p_service_id and barbershop_id=v_shop.id and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;

  v_end := p_start + make_interval(mins=>v_svc.duration_min);

  if p_barber_id is null then
    select (s.barber_ids)[1] into v_barber
    from get_available_slots(p_slug,p_service_id,null,(p_start at time zone v_shop.timezone)::date) s
    where s.slot_start=p_start;
  else
    v_barber:=p_barber_id;
  end if;
  if v_barber is null then raise exception 'SLOT_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_barber::text,0));

  if not exists (select 1 from get_available_slots(p_slug,p_service_id,v_barber,
                   (p_start at time zone v_shop.timezone)::date) s where s.slot_start=p_start)
  then raise exception 'SLOT_UNAVAILABLE'; end if;

  insert into customers(barbershop_id,name,phone,email)
  values (v_shop.id,btrim(p_name),p_phone,nullif(p_email,''))
  on conflict (barbershop_id,phone) do update
    set name=excluded.name, email=coalesce(excluded.email,customers.email)
  returning id into v_cust;

  if v_shop.deposit_enabled and v_svc.requires_deposit then
    v_dep := case v_shop.deposit_mode
               when 'percent' then round(v_svc.price_cents*v_shop.deposit_value/100.0)::int
               else v_shop.deposit_value end;
    v_status:='pending'; v_dstate:='awaiting';
  else
    v_status:='confirmed'; v_dstate:='not_required';
  end if;

  begin
    insert into appointments(barbershop_id,barber_id,service_id,haircut_id,customer_id,
      starts_at,ends_at,duration_min,price_cents,status,deposit_status,deposit_cents,
      hold_expires_at,source,confirmed_at)
    values (v_shop.id,v_barber,p_service_id,p_haircut_id,v_cust,
      p_start,v_end,v_svc.duration_min,v_svc.price_cents,v_status,v_dstate,v_dep,
      case when v_dep>0 then now()+make_interval(mins=>v_shop.deposit_hold_min) end,'online',
      case when v_status='confirmed' then now() end)
    returning id,appointments.manage_token into v_id,v_tok;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;

  perform enqueue_appointment_notifications(v_id);
  return query select v_id,v_tok,v_dep,(v_dep>0);
end $$;
grant execute on function public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text) to anon, authenticated;

-- catálogo de cortes (22 estilos)
create or replace function public.seed_haircut_catalogue(p_shop uuid) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not is_member(p_shop, array['owner','manager']::app_role[]) then raise exception 'FORBIDDEN'; end if;
  with c(name, description, ord) as (values
    ('Low fade','Degradê baixo, junto à orelha e nuca.',1),
    ('Mid fade','Degradê a meia altura, equilibrado.',2),
    ('High fade','Degradê alto, contraste forte.',3),
    ('Taper fade','Degradê suave só nas patilhas e nuca.',4),
    ('Skin fade','Degradê até à pele.',5),
    ('Drop fade','Degradê que desce em curva atrás da orelha.',6),
    ('Burst fade','Degradê em leque à volta da orelha.',7),
    ('Buzz cut','Máquina uniforme, muito curto.',8),
    ('Crew cut','Curto, topo ligeiramente mais longo.',9),
    ('Caesar','Franja curta e recta, textura no topo.',10),
    ('French crop','Franja texturizada com laterais curtas.',11),
    ('Pompadour','Volume para cima e para trás.',12),
    ('Quiff','Volume frontal, mais solto que o pompadour.',13),
    ('Slick back','Penteado para trás, liso.',14),
    ('Afro shape-up','Afro contornado com linhas definidas.',15),
    ('Waves','Ondas 360 com escova.',16),
    ('Twists','Torções curtas definidas.',17),
    ('Dreads retwist','Manutenção e retorção de dreads.',18),
    ('Corte à tesoura','Só tesoura, acabamento natural.',19),
    ('Corte infantil','Corte para crianças, rápido e calmo.',20),
    ('Design freestyle','Desenhos à navalha ao gosto do cliente.',21),
    ('Careca à navalha','Rapado total com navalha.',22))
  insert into haircuts(barbershop_id,name,description,sort_order)
  select p_shop, c.name, c.description, c.ord from c
  where not exists (select 1 from haircuts h where h.barbershop_id=p_shop and lower(h.name)=lower(c.name));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.seed_haircut_catalogue(uuid) to authenticated;

-- membros da equipa
create or replace function public.list_members(p_shop uuid)
returns table(id uuid, user_id uuid, role app_role, full_name text, email text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id, m.user_id, m.role, p.full_name, u.email::text, m.created_at
  from barbershop_members m
  join auth.users u on u.id=m.user_id
  left join profiles p on p.id=m.user_id
  where m.barbershop_id=p_shop and is_member(p_shop)
  order by m.created_at;
$$;
grant execute on function public.list_members(uuid) to authenticated;

create or replace function public.add_member_by_email(p_shop uuid, p_email text, p_role app_role)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_id uuid;
begin
  if not is_member(p_shop, array['owner']::app_role[]) then raise exception 'FORBIDDEN'; end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(p_email));
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  insert into barbershop_members(barbershop_id,user_id,role) values (p_shop,v_user,p_role)
  on conflict (barbershop_id,user_id) do update set role=excluded.role
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_member_by_email(uuid,text,app_role) to authenticated;
