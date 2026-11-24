-- Tenant-scoped commercial variants and explicit skill restrictions.
-- The original haircut.service_id remains the primary offer for backward compatibility.
alter table public.services add column category text not null default 'Outros',
 add column subcategory text not null default 'Geral',
 add constraint service_category_valid check(length(btrim(category)) between 1 and 80),
 add constraint service_subcategory_valid check(length(btrim(subcategory)) between 1 and 80);
alter table public.haircuts add column skill_restricted boolean not null default false;
create unique index if not exists services_tenant_identity_idx on public.services(id,barbershop_id);
create unique index if not exists haircuts_tenant_identity_idx on public.haircuts(id,barbershop_id);
create unique index if not exists barbers_tenant_identity_idx on public.barbers(id,barbershop_id);

create table public.haircut_service_offers(
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 haircut_id uuid not null,
 service_id uuid not null,
 price_cents integer check(price_cents>=0),
 duration_min integer check(duration_min between 5 and 480),
 primary key(haircut_id,service_id),
 foreign key(haircut_id,barbershop_id) references public.haircuts(id,barbershop_id) on delete cascade,
 foreign key(service_id,barbershop_id) references public.services(id,barbershop_id) on delete cascade
);
create index haircut_service_offers_service_idx on public.haircut_service_offers(service_id,barbershop_id);
create index haircut_service_offers_shop_idx on public.haircut_service_offers(barbershop_id);
alter table public.haircut_service_offers enable row level security;
revoke all on public.haircut_service_offers from public,anon,authenticated;
grant select on public.haircut_service_offers to authenticated;
create policy haircut_service_offers_read on public.haircut_service_offers for select to authenticated
 using(private.is_member(barbershop_id) or private.is_platform_admin());

create table public.haircut_barber_skills(
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 haircut_id uuid not null,
 barber_id uuid not null,
 primary key(haircut_id,barber_id),
 foreign key(haircut_id,barbershop_id) references public.haircuts(id,barbershop_id) on delete cascade,
 foreign key(barber_id,barbershop_id) references public.barbers(id,barbershop_id) on delete cascade
);
create index haircut_barber_skills_barber_idx on public.haircut_barber_skills(barber_id,barbershop_id);
create index haircut_barber_skills_shop_idx on public.haircut_barber_skills(barbershop_id);
alter table public.haircut_barber_skills enable row level security;
revoke all on public.haircut_barber_skills from public,anon,authenticated;
grant select on public.haircut_barber_skills to authenticated;
create policy haircut_barber_skills_read on public.haircut_barber_skills for select to authenticated
 using(private.is_member(barbershop_id) or private.is_platform_admin());

-- Assign known starter services only, including future seed inserts.
create or replace function private.default_service_category() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.category='Outros' and new.subcategory='Geral' then
  select x.category,x.subcategory into new.category,new.subcategory from (values
   ('corte clássico','Cabelo','Cortes'),('degradê / fade','Cabelo','Cortes'),('corte à tesoura','Cabelo','Cortes'),
   ('corte infantil','Cabelo','Infantil'),('raspagem à navalha','Cabelo','Cortes'),
   ('contorno / line-up','Cabelo','Acabamento'),('waves e escova','Cabelo','Textura'),
   ('manutenção de dreads e twists','Cabelo','Textura'),('barba e acabamento','Barba','Acabamento'),
   ('corte + barba','Combinações','Cabelo e barba'),('corte premium + barba','Combinações','Cabelo e barba'),
   ('coloração capilar','Tratamentos','Coloração'),('tratamento capilar','Tratamentos','Cuidados'),
   ('lavagem e finalização','Tratamentos','Cuidados'),('design de sobrancelhas','Estética','Sobrancelhas')
  ) x(name,category,subcategory) where x.name=lower(btrim(new.name));
  if not found then new.category:='Outros'; new.subcategory:='Geral'; end if;
 end if;
 return new;
end $$;
revoke all on function private.default_service_category() from public,anon,authenticated;
create trigger default_service_category before insert on public.services for each row execute function private.default_service_category();
update public.services s set category=x.category,subcategory=x.subcategory from (values
 ('corte clássico','Cabelo','Cortes'),('degradê / fade','Cabelo','Cortes'),('corte à tesoura','Cabelo','Cortes'),
 ('corte infantil','Cabelo','Infantil'),('raspagem à navalha','Cabelo','Cortes'),('contorno / line-up','Cabelo','Acabamento'),
 ('waves e escova','Cabelo','Textura'),('manutenção de dreads e twists','Cabelo','Textura'),('barba e acabamento','Barba','Acabamento'),
 ('corte + barba','Combinações','Cabelo e barba'),('corte premium + barba','Combinações','Cabelo e barba'),
 ('coloração capilar','Tratamentos','Coloração'),('tratamento capilar','Tratamentos','Cuidados'),
 ('lavagem e finalização','Tratamentos','Cuidados'),('design de sobrancelhas','Estética','Sobrancelhas')
) x(name,category,subcategory) where lower(btrim(s.name))=x.name;

create or replace function private.style_matches_service(p_shop uuid,p_service uuid,p_haircut uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_haircut is null or exists(
  select 1 from public.haircuts h where h.id=p_haircut and h.barbershop_id=p_shop and h.is_active
  and (h.service_id=p_service or exists(select 1 from public.haircut_service_offers o where o.haircut_id=h.id and o.service_id=p_service and o.barbershop_id=p_shop))
 )
$$;
create or replace function private.barber_can_style(p_shop uuid,p_haircut uuid,p_barber uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_haircut is null or exists(select 1 from public.haircuts h where h.id=p_haircut and h.barbershop_id=p_shop
  and (not h.skill_restricted or exists(select 1 from public.haircut_barber_skills k where k.haircut_id=h.id and k.barber_id=p_barber and k.barbershop_id=p_shop)))
$$;
revoke all on function private.style_matches_service(uuid,uuid,uuid),private.barber_can_style(uuid,uuid,uuid) from public,anon,authenticated;

-- One atomic owner/manager save for the style, additional offers and skill assignments.
create or replace function public.save_haircut_configuration(p_shop uuid,p_haircut uuid,p_entry jsonb,p_offers jsonb,p_skill_barbers uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_primary uuid; v_restricted boolean; v_price integer; v_duration integer; v_name text;
begin
 if not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
 if jsonb_typeof(p_entry)<>'object' or jsonb_typeof(p_offers)<>'array' or jsonb_array_length(p_offers)>50 or cardinality(coalesce(p_skill_barbers,'{}'::uuid[]))>200 then raise exception 'INVALID_BOOKING_OFFER'; end if;
 v_primary:=nullif(p_entry->>'service_id','')::uuid;
 v_restricted:=coalesce((p_entry->>'skill_restricted')::boolean,false);
 v_price:=(p_entry->>'price_cents')::integer; v_duration:=(p_entry->>'duration_min')::integer; v_name:=btrim(p_entry->>'name');
 if v_name is null or length(v_name) not between 2 and 120 or (v_primary is null and (v_price is not null or v_duration is not null)) or (v_price is not null and v_price<0) or (v_duration is not null and v_duration not between 5 and 480) then raise exception 'INVALID_BOOKING_OFFER'; end if;
 if v_primary is not null and not exists(select 1 from public.services s where s.id=v_primary and s.barbershop_id=p_shop) then raise exception 'TENANT_RELATION_MISMATCH'; end if;
 if exists(select 1 from jsonb_to_recordset(p_offers) as o(service_id uuid,price_cents integer,duration_min integer) where o.service_id is null or o.service_id=v_primary or o.price_cents<0 or o.duration_min not between 5 and 480 or not exists(select 1 from public.services s where s.id=o.service_id and s.barbershop_id=p_shop)) then raise exception 'INVALID_BOOKING_OFFER'; end if;
 if exists(select 1 from jsonb_to_recordset(p_offers) as o(service_id uuid) group by o.service_id having count(*)>1) then raise exception 'INVALID_BOOKING_OFFER'; end if;
 if exists(select 1 from unnest(coalesce(p_skill_barbers,'{}'::uuid[])) k(id) where not exists(select 1 from public.barbers b where b.id=k.id and b.barbershop_id=p_shop)) then raise exception 'TENANT_RELATION_MISMATCH'; end if;
 if p_haircut is null then
  insert into public.haircuts(barbershop_id,name,description,service_id,price_cents,duration_min,photo_url,skill_restricted,sort_order)
  values(p_shop,v_name,nullif(btrim(p_entry->>'description'),''),v_primary,v_price,v_duration,p_entry->>'photo_url',v_restricted,coalesce((select max(sort_order)+1 from public.haircuts where barbershop_id=p_shop),0)) returning id into v_id;
 else
  update public.haircuts h set name=v_name,description=nullif(btrim(p_entry->>'description'),''),service_id=v_primary,price_cents=v_price,duration_min=v_duration,photo_url=p_entry->>'photo_url',skill_restricted=v_restricted
  where h.id=p_haircut and h.barbershop_id=p_shop returning h.id into v_id;
  if not found then raise exception 'HAIRCUT_NOT_FOUND'; end if;
 end if;
 delete from public.haircut_service_offers where haircut_id=v_id;
 insert into public.haircut_service_offers(barbershop_id,haircut_id,service_id,price_cents,duration_min)
 select p_shop,v_id,o.service_id,o.price_cents,o.duration_min from jsonb_to_recordset(p_offers) as o(service_id uuid,price_cents integer,duration_min integer);
 delete from public.haircut_barber_skills where haircut_id=v_id;
 if v_restricted then
  insert into public.haircut_barber_skills(barbershop_id,haircut_id,barber_id) select p_shop,v_id,k.id from (select distinct unnest(coalesce(p_skill_barbers,'{}'::uuid[])) id) k;
 end if;
 insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'haircut_configuration_saved','haircut',v_id,jsonb_build_object('offer_count',jsonb_array_length(p_offers),'restricted',v_restricted,'skill_count',cardinality(coalesce(p_skill_barbers,'{}'::uuid[]))));
 return v_id;
end $$;
revoke all on function public.save_haircut_configuration(uuid,uuid,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.save_haircut_configuration(uuid,uuid,jsonb,jsonb,uuid[]) to authenticated;

create or replace function private.available_slots_for_offer(p_slug text,p_service_id uuid,p_barber_id uuid,p_date date,p_duration integer,p_haircut_id uuid,p_exclude uuid)
returns table(slot_start timestamptz,barber_ids uuid[]) language sql stable security definer set search_path='' as $$
 select x.slot_start,array_agg(b.id order by b.id) from private.available_slots_for_duration(p_slug,p_service_id,p_barber_id,p_date,p_duration,p_exclude) x
 cross join lateral unnest(x.barber_ids) b(id)
 join public.barbershops sh on sh.slug=p_slug
 where private.barber_can_style(sh.id,p_haircut_id,b.id)
 group by x.slot_start order by x.slot_start
$$;
revoke all on function private.available_slots_for_offer(text,uuid,uuid,date,integer,uuid,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.resolve_booking_offer(p_shop uuid, p_service uuid, p_haircut uuid)
 RETURNS TABLE(price_cents integer, duration_min integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.services%rowtype; h public.haircuts%rowtype; o public.haircut_service_offers%rowtype;
begin
  select * into s from public.services where id=p_service and barbershop_id=p_shop and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
  if p_haircut is not null then
    select * into h from public.haircuts where id=p_haircut and barbershop_id=p_shop and is_active and private.style_matches_service(p_shop,p_service,p_haircut);
    if not found then raise exception 'HAIRCUT_NOT_FOUND'; end if;
  end if;
  if p_haircut is not null and h.service_id is distinct from p_service then
    select * into o from public.haircut_service_offers where haircut_id=p_haircut and service_id=p_service and barbershop_id=p_shop;
    if not found then raise exception 'HAIRCUT_NOT_FOUND'; end if;
    price_cents := coalesce(o.price_cents,s.price_cents); duration_min := coalesce(o.duration_min,s.duration_min);
  else
    price_cents := coalesce(h.price_cents,s.price_cents); duration_min := coalesce(h.duration_min,s.duration_min);
  end if;
  if price_cents < 0 or duration_min not between 5 and 480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
  return next;
end;
$function$;
CREATE OR REPLACE FUNCTION private.book_appointment_core(p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_source booking_source, p_created_by uuid DEFAULT NULL::uuid, p_internal_note text DEFAULT NULL::text)
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
    and is_active
  for share;

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
      and private.style_matches_service(v_shop.id,p_service_id,p_haircut_id)
    for share;

    if not found then
      raise exception 'HAIRCUT_NOT_FOUND';
    end if;
  end if;

  select o.price_cents,o.duration_min into v_svc.price_cents,v_svc.duration_min
  from private.resolve_booking_offer(v_shop.id,p_service_id,p_haircut_id) o;

  v_slot_date := (p_start at time zone v_shop.timezone)::date;

  if p_barber_id is null then
    select (s.barber_ids)[1]
    into v_barber
    from private.available_slots_for_offer(
      btrim(p_slug),p_service_id,null,v_slot_date,v_svc.duration_min,p_haircut_id,null
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
    from private.available_slots_for_offer(
      btrim(p_slug),p_service_id,v_barber,v_slot_date,v_svc.duration_min,p_haircut_id,null
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
CREATE OR REPLACE FUNCTION public.get_offer_available_slots(p_slug text, p_service_id uuid, p_barber_id uuid, p_date date, p_haircut_id uuid)
 RETURNS TABLE(slot_start timestamp with time zone, barber_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_shop uuid; v_duration integer;
begin
  select id into v_shop from public.barbershops where slug=p_slug and status in ('active','trial');
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  select o.duration_min into v_duration from private.resolve_booking_offer(v_shop,p_service_id,p_haircut_id) o;
  return query select * from private.available_slots_for_offer(p_slug,p_service_id,p_barber_id,p_date,v_duration,p_haircut_id,null);
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_offer_available_days(p_slug text, p_service_id uuid, p_barber_id uuid, p_from date, p_to date, p_haircut_id uuid)
 RETURNS TABLE(day date, slots_count integer, is_open boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.barbershops%rowtype;
  d date;
  v_today date;
  v_end date;
begin
  select * into v_shop
  from public.barbershops
  where slug=p_slug
    and status in ('active','trial');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_today := (now() at time zone v_shop.timezone)::date;

  if p_from is null then p_from := v_today; end if;
  if p_to is null then p_to := p_from + 13; end if;

  if p_to < p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  p_from := greatest(p_from,v_today);
  v_end := least(p_to,p_from+60,v_today+v_shop.max_advance_days);

  if v_end < p_from then
    return;
  end if;

  for d in
    select generate_series(p_from,v_end,interval '1 day')::date
  loop
    day := d;

    select count(*)::int into slots_count
    from public.get_offer_available_slots(p_slug,p_service_id,p_barber_id,d,p_haircut_id);

    select exists (
      with candidates as (
        select b.id
        from public.barbers b
        join public.barber_services bs
          on bs.barber_id=b.id
         and bs.service_id=p_service_id
        where b.barbershop_id=v_shop.id
          and b.is_active
          and (p_barber_id is null or b.id=p_barber_id)
          and private.barber_can_style(v_shop.id,p_haircut_id,b.id)
      ),
      effective_windows as (
        select
          c.id as barber_id,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.opens_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.opens_at end
            else
              case when sw.is_closed then null::time else sw.opens_at end
          end as opens_at,
          case
            when so.id is not null then
              case when so.is_closed then null::time else so.closes_at end
            when bw.id is not null then
              case when bw.is_closed then null::time else bw.closes_at end
            else
              case when sw.is_closed then null::time else sw.closes_at end
          end as closes_at
        from candidates c
        left join lateral (
          select * from public.schedule_overrides so
          where so.barbershop_id=v_shop.id
            and so.override_date=d
            and (so.barber_id=c.id or so.barber_id is null)
          order by (so.barber_id is not null) desc
          limit 1
        ) so on true
        left join lateral (
          select * from public.working_hours bw
          where bw.barbershop_id=v_shop.id
            and bw.barber_id=c.id
            and bw.weekday=extract(dow from d)::int
          limit 1
        ) bw on true
        left join lateral (
          select * from public.working_hours sw
          where sw.barbershop_id=v_shop.id
            and sw.barber_id is null
            and sw.weekday=extract(dow from d)::int
          limit 1
        ) sw on true
      )
      select 1
      from effective_windows ew
      where ew.opens_at is not null
        and ew.closes_at is not null
        and ew.closes_at > ew.opens_at
      limit 1
    ) into is_open;

    return next;
  end loop;
end
$function$;
CREATE OR REPLACE FUNCTION private.validate_domain_tenant_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  case tg_table_name
    when 'barber_services' then
      if not exists (
        select 1 from public.barbers b where b.id=new.barber_id
      ) or not exists (
        select 1 from public.services s where s.id=new.service_id
      ) then
        raise exception 'RELATED_ENTITY_NOT_FOUND';
      end if;
      if (
        select b.barbershop_id from public.barbers b where b.id=new.barber_id
      ) is distinct from (
        select s.barbershop_id from public.services s where s.id=new.service_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'haircuts' then
      if new.service_id is not null
         and not exists (
           select 1 from public.services s
           where s.id=new.service_id and s.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'working_hours', 'time_blocks', 'schedule_overrides' then
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'appointments' then
      if not exists (
        select 1 from public.barbers b
        where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if not exists (
        select 1 from public.services s
        where s.id=new.service_id and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if not exists (
        select 1 from public.customers c
        where c.id=new.customer_id and c.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.haircut_id is not null then
        -- Always enforce tenant isolation, including legacy reservations.
        if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.barbershop_id=new.barbershop_id) then
          raise exception 'TENANT_RELATION_MISMATCH';
        end if;
        -- A historical commercial pair is a snapshot, not a live catalog link.
        -- New or changed pairs must match the currently active service.
        if tg_op='INSERT' then
          if not private.style_matches_service(new.barbershop_id,new.service_id,new.haircut_id) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        elsif new.haircut_id is distinct from old.haircut_id or new.service_id is distinct from old.service_id then
          if not private.style_matches_service(new.barbershop_id,new.service_id,new.haircut_id) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        end if;
      end if;

    when 'waitlist_entries' then
      if not exists (
        select 1 from public.services s
        where s.id=new.service_id and s.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.haircut_id is not null then
        -- Always enforce tenant isolation, including legacy reservations.
        if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.barbershop_id=new.barbershop_id) then
          raise exception 'TENANT_RELATION_MISMATCH';
        end if;
        -- A historical commercial pair is a snapshot, not a live catalog link.
        -- New or changed pairs must match the currently active service.
        if tg_op='INSERT' then
          if not private.style_matches_service(new.barbershop_id,new.service_id,new.haircut_id) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        elsif new.haircut_id is distinct from old.haircut_id or new.service_id is distinct from old.service_id then
          if not private.style_matches_service(new.barbershop_id,new.service_id,new.haircut_id) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        end if;
      end if;

    when 'reviews' then
      if not exists (
        select 1 from public.appointments a
        where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
      ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.barber_id is not null
         and not exists (
           select 1 from public.barbers b
           where b.id=new.barber_id and b.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'payments' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;

    when 'notifications' then
      if new.appointment_id is not null
         and not exists (
           select 1 from public.appointments a
           where a.id=new.appointment_id and a.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
      if new.waitlist_entry_id is not null
         and not exists (
           select 1 from public.waitlist_entries w
           where w.id=new.waitlist_entry_id and w.barbershop_id=new.barbershop_id
         ) then
        raise exception 'TENANT_RELATION_MISMATCH';
      end if;
  end case;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.join_waitlist(p_slug text, p_service_id uuid, p_customer_name text, p_phone text, p_haircut_id uuid DEFAULT NULL::uuid, p_barber_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_period text DEFAULT 'any'::text)
 RETURNS TABLE(status waitlist_status, queued_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and private.style_matches_service(sh.id,p_service_id,p_haircut_id)
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
      and private.barber_can_style(sh.id,p_haircut_id,b.id)
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
CREATE OR REPLACE FUNCTION private.offer_next_waitlist_core(p_shop uuid, p_slot_start timestamp with time zone, p_barber_id uuid)
 RETURNS TABLE(waitlist_entry_id uuid, offer_token uuid, offer_expires_at timestamp with time zone, customer_name text, phone text, email text, service_id uuid, haircut_id uuid, barber_id uuid, slot_start timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  w public.waitlist_entries%rowtype;
  v_date date;
  v_available boolean;
  v_offer_token uuid;
  v_expires timestamptz;
begin
  if p_shop is null or p_slot_start is null or p_barber_id is null then
    raise exception 'WAITLIST_SLOT_REQUIRED';
  end if;

  select * into sh
  from public.barbershops
  where id=p_shop
    and status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=p_shop
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'waitlist-slot:' || p_shop::text || ':' || p_barber_id::text || ':' || p_slot_start::text,
      0
    )
  );

  v_date := (p_slot_start at time zone sh.timezone)::date;

  update public.waitlist_entries we
  set status='expired'
  where we.barbershop_id=p_shop
    and we.status='offered'
    and we.offer_slot_start=p_slot_start
    and we.offer_barber_id=p_barber_id
    and we.offer_expires_at <= now();

  if exists (
    select 1
    from public.waitlist_entries active_offer
    where active_offer.barbershop_id=p_shop
      and active_offer.status='offered'
      and active_offer.offer_slot_start=p_slot_start
      and active_offer.offer_barber_id=p_barber_id
      and active_offer.offer_expires_at > now()
  ) then
    return;
  end if;

  for w in
    select we.*
    from public.waitlist_entries we
    where we.barbershop_id=p_shop
      and we.status='waiting'
      and exists (
        select 1
        from public.services s
        where s.id=we.service_id
          and s.barbershop_id=p_shop
          and s.is_active
      )
      and private.style_matches_service(p_shop,we.service_id,we.haircut_id)
      and (we.barber_id is null or we.barber_id=p_barber_id)
      and (we.date_from is null or v_date >= we.date_from)
      and (we.date_to is null or v_date <= we.date_to)
      and private.waitlist_period_matches(
        we.period,
        p_slot_start,
        sh.timezone
      )
    order by we.created_at,we.id
    for update skip locked
  loop
    select exists (
      select 1
      from public.get_offer_available_slots(
        sh.slug,
        w.service_id,
        p_barber_id,
        v_date,w.haircut_id
      ) av
      where av.slot_start=p_slot_start
    )
    into v_available;

    if v_available then
      v_offer_token := gen_random_uuid();
      v_expires := now() + interval '15 minutes';

      update public.waitlist_entries we
      set status='offered',
          offer_token=v_offer_token,
          offer_slot_start=p_slot_start,
          offer_barber_id=p_barber_id,
          offer_expires_at=v_expires
      where we.id=w.id
      returning
        we.id,
        we.offer_token,
        we.offer_expires_at,
        we.customer_name,
        we.phone,
        we.email,
        we.service_id,
        we.haircut_id,
        we.barber_id,
        we.offer_slot_start
      into
        waitlist_entry_id,
        offer_token,
        offer_expires_at,
        customer_name,
        phone,
        email,
        service_id,
        haircut_id,
        barber_id,
        slot_start;

      insert into public.notifications(
        barbershop_id,
        waitlist_entry_id,
        channel,
        template_key,
        recipient,
        scheduled_for,
        payload
      )
      values(
        p_shop,
        waitlist_entry_id,
        'whatsapp',
        'waitlist_offer',
        phone,
        now(),
        jsonb_build_object(
          'offer_token',offer_token,
          'slot_start',slot_start,
          'expires_at',offer_expires_at,
          'service_id',service_id,
          'barber_id',barber_id,
          'shop_slug',sh.slug,
          'shop_name',sh.name
        )
      );

      if email is not null then
        insert into public.notifications(
          barbershop_id,
          waitlist_entry_id,
          channel,
          template_key,
          recipient,
          scheduled_for,
          payload
        )
        values(
          p_shop,
          waitlist_entry_id,
          'email',
          'waitlist_offer',
          email,
          now(),
          jsonb_build_object(
            'offer_token',offer_token,
            'slot_start',slot_start,
            'expires_at',offer_expires_at,
            'service_id',service_id,
            'barber_id',barber_id,
            'shop_slug',sh.slug,
            'shop_name',sh.name
          )
        );
      end if;

      insert into public.audit_logs(
        barbershop_id,actor_id,action,entity,entity_id,diff
      )
      values(
        p_shop,
        auth.uid(),
        'waitlist_offer_created',
        'waitlist_entry',
        waitlist_entry_id,
        jsonb_build_object(
          'slot_start',slot_start,
          'barber_id',barber_id,
          'offer_expires_at',offer_expires_at
        )
      );

      return next;
      return;
    end if;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_waitlist_offer(p_token uuid)
 RETURNS TABLE(status waitlist_status, can_claim boolean, customer_name text, service_name text, service_price_cents integer, service_duration_min integer, haircut_name text, barber_name text, slot_start timestamp with time zone, offer_expires_at timestamp with time zone, shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, timezone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    w.status,
    (w.status='offered' and w.offer_expires_at > now() and private.style_matches_service(w.barbershop_id,w.service_id,w.haircut_id) and private.barber_can_style(w.barbershop_id,w.haircut_id,w.offer_barber_id)) as can_claim,
    w.customer_name,
    s.name,
    case when h.service_id=s.id then coalesce(h.price_cents,s.price_cents) else coalesce(o.price_cents,s.price_cents) end,
    case when h.service_id=s.id then coalesce(h.duration_min,s.duration_min) else coalesce(o.duration_min,s.duration_min) end,
    h.name,
    b.display_name,
    w.offer_slot_start,
    w.offer_expires_at,
    sh.name,
    sh.slug,
    sh.phone,
    sh.whatsapp,
    sh.timezone
  from public.waitlist_entries w
  join public.barbershops sh on sh.id=w.barbershop_id
  join public.services s on s.id=w.service_id
  left join public.haircuts h on h.id=w.haircut_id
  left join public.haircut_service_offers o on o.haircut_id=w.haircut_id and o.service_id=w.service_id
  left join public.barbers b on b.id=w.offer_barber_id
  where w.offer_token=p_token
    and w.status in ('offered','converted','expired','cancelled')
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_operator(p_shop uuid, p_appointment uuid, p_new_start timestamp with time zone, p_new_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(appointment_id uuid, new_starts_at timestamp with time zone, new_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.appointments%rowtype;
  svc public.services%rowtype;
  c public.customers%rowtype;
  sh public.barbershops%rowtype;
  target_barber uuid;
  new_barber_name text;
  old_barber uuid;
  old_start timestamptz;
  v_date date;
  v_end timestamptz;
  v_available boolean;
begin
  if p_new_start is null then raise exception 'INVALID_DATE'; end if;

  select * into a from public.appointments where id=p_appointment and barbershop_id=p_shop;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  target_barber:=coalesce(p_new_barber_id,a.barber_id);
  old_barber:=a.barber_id;

  if target_barber is null then raise exception 'BARBER_NOT_FOUND'; end if;

  if private.is_platform_admin() then
    null;
  elsif private.is_member(p_shop,array['owner','manager']::public.app_role[]) then
    null;
  elsif private.is_member(p_shop,array['barber']::public.app_role[]) then
    if old_barber<>private.my_barber_id(p_shop) or target_barber<>private.my_barber_id(p_shop) then
      raise exception 'SHOP_OPERATOR_REQUIRED';
    end if;
  else
    raise exception 'SHOP_OPERATOR_REQUIRED';
  end if;

  if a.status not in ('pending','confirmed') or a.starts_at<=now() then
    raise exception 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;

  if target_barber<>old_barber then
    if target_barber::text<old_barber::text then
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||target_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
    else
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
      perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||target_barber::text,0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||old_barber::text,0));
  end if;

  select * into a from public.appointments where id=p_appointment and barbershop_id=p_shop for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if a.barber_id<>old_barber or a.status not in ('pending','confirmed') or a.starts_at<=now() then raise exception 'APPOINTMENT_NOT_RESCHEDULABLE'; end if;

  if a.starts_at=p_new_start and a.barber_id=target_barber then
    return query select a.id,a.starts_at,a.ends_at;
    return;
  end if;

  select * into sh from public.barbershops where id=p_shop;
  select * into svc from public.services where id=a.service_id and barbershop_id=p_shop and is_active;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.barbers b
    join public.barber_services bs on bs.barber_id=b.id
    where b.id=target_barber and b.barbershop_id=p_shop and b.is_active and bs.service_id=a.service_id
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  if target_barber<>old_barber and not private.barber_can_style(p_shop,a.haircut_id,target_barber) then raise exception 'BARBER_NOT_FOUND'; end if;
  if p_new_start<=now() then raise exception 'INVALID_DATE'; end if;
  v_date:=(p_new_start at time zone sh.timezone)::date;

  select exists(
    select 1 from private.available_slots_for_duration(sh.slug,a.service_id,target_barber,v_date,a.duration_min,a.id)
    where slot_start=p_new_start
  ) into v_available;

  if not v_available then raise exception 'SLOT_TAKEN'; end if;

  old_start:=a.starts_at;
  v_end:=p_new_start+make_interval(mins=>a.duration_min);

  select * into c from public.customers where id=a.customer_id and barbershop_id=p_shop;
  select b.display_name into new_barber_name from public.barbers b where b.id=target_barber and b.barbershop_id=p_shop;

  update public.notifications n set status='skipped',error='appointment_rescheduled'
  where n.appointment_id=a.id and n.status='queued' and n.template_key in ('reminder_24h','reminder_1h');

  update public.appointments set barber_id=target_barber,starts_at=p_new_start,ends_at=v_end where id=a.id;

  if c.phone is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(p_shop,a.id,'whatsapp','appointment_rescheduled',c.phone,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',old_start,'starts_at',p_new_start,'ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber));
    if p_new_start-interval '24 hours'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_24h',c.phone,p_new_start-interval '24 hours',jsonb_build_object('manage_token',a.manage_token));
    end if;
    if p_new_start-interval '1 hour'>now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(p_shop,a.id,'whatsapp','reminder_1h',c.phone,p_new_start-interval '1 hour',jsonb_build_object('manage_token',a.manage_token));
    end if;
  end if;

  if c.email is not null then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values(p_shop,a.id,'email','appointment_rescheduled',c.email,now(),
      jsonb_build_object('manage_token',a.manage_token,'old_starts_at',old_start,'starts_at',p_new_start,'ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber));
  end if;

  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'appointment_rescheduled','appointment',a.id,
    jsonb_build_object('source','operator','old_starts_at',old_start,'new_starts_at',p_new_start,'new_ends_at',v_end,'old_barber_id',old_barber,'new_barber_id',target_barber,'new_barber_name',new_barber_name));

  return query select a.id,p_new_start,v_end;
exception when exclusion_violation then
  raise exception 'SLOT_TAKEN';
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_public_barbershop(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  v_payload jsonb;
begin
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select *
  into sh
  from public.barbershops
  where slug=btrim(p_slug)
    and status in ('active','trial')
  limit 1;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'shop', jsonb_build_object(
      'name', sh.name,
      'slug', sh.slug,
      'description', sh.description,
      'logo_url', sh.logo_url,
      'cover_url', sh.cover_url,
      'theme_key', sh.theme_key,
      'phone', sh.phone,
      'whatsapp', sh.whatsapp,
      'instagram', sh.instagram,
      'address', sh.address,
      'maps_url', sh.maps_url,
      'lat', sh.lat,
      'lng', sh.lng,
      'timezone', sh.timezone,
      'status', sh.status,
      'deposit_enabled', sh.deposit_enabled,
      'deposit_mode', sh.deposit_mode,
      'deposit_value', sh.deposit_value,
      'deposit_hold_min', sh.deposit_hold_min,
      'slot_interval_min', sh.slot_interval_min,
      'min_lead_time_min', sh.min_lead_time_min,
      'max_advance_days', sh.max_advance_days,
      'cancellation_rule', sh.cancellation_rule
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'price_cents', s.price_cents,
          'duration_min', s.duration_min,
          'requires_deposit', s.requires_deposit,
          'category',s.category,'subcategory',s.subcategory,
          'photo_url', s.photo_url
        )
        order by s.sort_order, s.name
      )
      from public.services s
      where s.barbershop_id=sh.id
        and s.is_active
    ), '[]'::jsonb),
    'haircuts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'service_id', h.service_id,
          'name', h.name,
          'description', h.description,
          'photo_url', h.photo_url,
          'price_cents', h.price_cents,
          'duration_min', h.duration_min,
          'skill_restricted',h.skill_restricted,
          'skill_barber_ids',coalesce((select jsonb_agg(k.barber_id order by k.barber_id) from public.haircut_barber_skills k join public.barbers b on b.id=k.barber_id and b.is_active where k.haircut_id=h.id),'[]'::jsonb),
          'additional_offers',coalesce((select jsonb_agg(jsonb_build_object('service_id',o.service_id,'price_cents',o.price_cents,'duration_min',o.duration_min) order by o.service_id) from public.haircut_service_offers o join public.services s on s.id=o.service_id and s.is_active where o.haircut_id=h.id),'[]'::jsonb)
        )
        order by h.sort_order, h.name
      )
      from public.haircuts h
      where h.barbershop_id=sh.id
        and h.is_active
    ), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'display_name', b.display_name,
          'photo_url', b.photo_url,
          'bio', b.bio,
          'years_experience', b.years_experience,
          'rating_avg', b.rating_avg,
          'rating_count', b.rating_count,
          'service_ids', coalesce((
            select jsonb_agg(bs.service_id order by bs.service_id)
            from public.barber_services bs
            where bs.barber_id=b.id
          ), '[]'::jsonb)
        )
        order by b.sort_order, b.display_name
      )
      from public.barbers b
      where b.barbershop_id=sh.id
        and b.is_active
    ), '[]'::jsonb),
    'working_hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', wh.weekday,
          'opens_at', wh.opens_at,
          'closes_at', wh.closes_at,
          'is_closed', wh.is_closed
        )
        order by wh.weekday
      )
      from public.working_hours wh
      where wh.barbershop_id=sh.id
        and wh.barber_id is null
    ), '[]'::jsonb),
    'reviews', jsonb_build_object(
      'rating_avg', coalesce((
        select round(avg(r.rating)::numeric,2)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),0),
      'rating_count', (
        select count(*)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rating', r.rating,
            'comment', r.comment,
            'created_at', r.created_at
          )
          order by r.created_at desc
        )
        from (
          select rating,comment,created_at
          from public.reviews
          where barbershop_id=sh.id
            and is_published
          order by created_at desc
          limit 6
        ) r
      ), '[]'::jsonb)
    )
  )
  into v_payload;

  return v_payload;
end;
$function$;
