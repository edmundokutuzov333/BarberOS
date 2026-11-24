-- Explicit service composition. Each component occupies the same barber, sequentially,
-- for the sum of its duration. Price and components are immutable appointment snapshots.
create table public.service_addons(
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 service_id uuid not null,
 addon_service_id uuid not null,
 primary key(service_id,addon_service_id),
 check(service_id<>addon_service_id),
 foreign key(service_id,barbershop_id) references public.services(id,barbershop_id) on delete cascade,
 foreign key(addon_service_id,barbershop_id) references public.services(id,barbershop_id) on delete cascade
);
create index service_addons_addon_idx on public.service_addons(addon_service_id,barbershop_id);
create index service_addons_shop_idx on public.service_addons(barbershop_id);
alter table public.service_addons enable row level security;
revoke all on public.service_addons from public,anon,authenticated;
grant select on public.service_addons to authenticated;
create policy service_addons_read on public.service_addons for select to authenticated using(private.is_member(barbershop_id) or private.is_platform_admin());

alter table public.appointments add column service_components jsonb not null default '[]'::jsonb,
 add constraint appointment_service_components_array check(jsonb_typeof(service_components)='array' and jsonb_array_length(service_components)<=6);
alter table public.waitlist_entries add column addon_service_ids uuid[] not null default '{}'::uuid[],
 add column offer_composition jsonb,
 add constraint waitlist_addon_count check(cardinality(addon_service_ids)<=5),
 add constraint waitlist_offer_composition_array check(offer_composition is null or jsonb_typeof(offer_composition)='array');

-- Starter pairings use the shop's real prices and service qualifications. No fabricated services.
-- Only new service insertion introduces default relations; edits to an existing configuration do not re-seed it.
create or replace function private.seed_service_addons(p_shop uuid,p_new_service uuid default null) returns void
language sql security definer set search_path='' as $$
 insert into public.service_addons(barbershop_id,service_id,addon_service_id)
 select p_shop,s.id,a.id from public.services s join public.services a on a.barbershop_id=s.barbershop_id and a.id<>s.id
 where s.barbershop_id=p_shop
 and lower(btrim(s.name)) in ('corte clássico','degradê / fade','corte à tesoura','contorno / line-up','raspagem à navalha')
 and lower(btrim(a.name)) in ('barba e acabamento','lavagem e finalização','design de sobrancelhas')
 and (p_new_service is null or p_new_service in (s.id,a.id))
 on conflict do nothing
$$;
revoke all on function private.seed_service_addons(uuid,uuid) from public,anon,authenticated;
select private.seed_service_addons(b.id,null) from public.barbershops b;
create or replace function private.seed_new_service_addons() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.seed_service_addons(new.barbershop_id,new.id); return new; end $$;
revoke all on function private.seed_new_service_addons() from public,anon,authenticated;
create trigger seed_new_service_addons after insert on public.services for each row execute function private.seed_new_service_addons();

create or replace function public.save_service_configuration(p_shop uuid,p_service uuid,p_entry jsonb,p_addon_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text; v_price integer; v_duration integer; v_category text; v_subcategory text;
begin
 if not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
 v_name:=btrim(p_entry->>'name'); v_price:=(p_entry->>'price_cents')::integer; v_duration:=(p_entry->>'duration_min')::integer;
 v_category:=btrim(p_entry->>'category'); v_subcategory:=btrim(p_entry->>'subcategory');
 if v_name is null or length(v_name) not between 2 and 120 or v_price is null or v_price<0 or v_duration is null or v_duration not between 5 and 480 or v_category is null or length(v_category) not between 1 and 80 or v_subcategory is null or length(v_subcategory) not between 1 and 80 or cardinality(coalesce(p_addon_ids,'{}'::uuid[]))>50 then raise exception 'INVALID_BOOKING_OFFER'; end if;
 if exists(select 1 from unnest(coalesce(p_addon_ids,'{}'::uuid[])) a(id) where a.id is null or a.id=p_service or not exists(select 1 from public.services s where s.id=a.id and s.barbershop_id=p_shop)) then raise exception 'TENANT_RELATION_MISMATCH'; end if;
 if p_service is null then
  insert into public.services(barbershop_id,name,price_cents,duration_min,requires_deposit,photo_url,category,subcategory,sort_order)
  values(p_shop,v_name,v_price,v_duration,coalesce((p_entry->>'requires_deposit')::boolean,false),p_entry->>'photo_url',v_category,v_subcategory,coalesce((select max(sort_order)+1 from public.services where barbershop_id=p_shop),0)) returning id into v_id;
 else
  update public.services s set name=v_name,price_cents=v_price,duration_min=v_duration,requires_deposit=coalesce((p_entry->>'requires_deposit')::boolean,false),photo_url=p_entry->>'photo_url',category=v_category,subcategory=v_subcategory where s.id=p_service and s.barbershop_id=p_shop returning s.id into v_id;
  if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
 end if;
 delete from public.service_addons where service_id=v_id;
 insert into public.service_addons(barbershop_id,service_id,addon_service_id) select p_shop,v_id,a.id from (select distinct unnest(coalesce(p_addon_ids,'{}'::uuid[])) id) a;
 insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'service_configuration_saved','service',v_id,jsonb_build_object('addon_count',cardinality(coalesce(p_addon_ids,'{}'::uuid[]))));
 return v_id;
end $$;
revoke all on function public.save_service_configuration(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.save_service_configuration(uuid,uuid,jsonb,uuid[]) to authenticated;

create or replace function private.resolve_booking_composition(p_shop uuid,p_service uuid,p_haircut uuid,p_addons uuid[])
returns table(price_cents integer,duration_min integer,requires_deposit boolean,components jsonb)
language plpgsql stable security definer set search_path='' as $$
declare v_base record; s public.services%rowtype; a public.services%rowtype; v_total bigint; v_duration int; v_ids uuid[]:=coalesce(p_addons,'{}'::uuid[]);
begin
 if cardinality(v_ids)>5 or array_position(v_ids,null) is not null or p_service=any(v_ids) or cardinality(v_ids)<>(select count(distinct id) from unnest(v_ids) t(id)) then raise exception 'INVALID_BOOKING_OFFER'; end if;
 select * into s from public.services where id=p_service and barbershop_id=p_shop and is_active;
 if not found then raise exception 'SERVICE_NOT_FOUND'; end if;
 select * into v_base from private.resolve_booking_offer(p_shop,p_service,p_haircut);
 v_total:=v_base.price_cents; v_duration:=v_base.duration_min; requires_deposit:=s.requires_deposit;
 components:=jsonb_build_array(jsonb_build_object('service_id',s.id,'name',s.name,'price_cents',v_base.price_cents,'duration_min',v_base.duration_min));
 for a in select z.* from unnest(v_ids) t(id) join public.service_addons m on m.service_id=p_service and m.addon_service_id=t.id and m.barbershop_id=p_shop join public.services z on z.id=m.addon_service_id and z.barbershop_id=p_shop and z.is_active order by z.id
 loop
   v_total:=v_total+a.price_cents; v_duration:=v_duration+a.duration_min; requires_deposit:=requires_deposit or a.requires_deposit;
   components:=components||jsonb_build_array(jsonb_build_object('service_id',a.id,'name',a.name,'price_cents',a.price_cents,'duration_min',a.duration_min));
 end loop;
 if jsonb_array_length(components)<>1+cardinality(v_ids) then raise exception 'INVALID_BOOKING_OFFER'; end if;
 if v_total>2147483647 or v_duration>480 then raise exception 'INVALID_BOOKING_OFFER'; end if;
 price_cents:=v_total::int; duration_min:=v_duration; return next;
end $$;
revoke all on function private.resolve_booking_composition(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;

create or replace function private.barber_can_addons(p_barber uuid,p_addons uuid[]) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from unnest(coalesce(p_addons,'{}'::uuid[])) a(id) where not exists(select 1 from public.barber_services bs where bs.barber_id=p_barber and bs.service_id=a.id))
$$;
revoke all on function private.barber_can_addons(uuid,uuid[]) from public,anon,authenticated;

create or replace function private.available_slots_for_composition(p_slug text,p_service uuid,p_barber uuid,p_date date,p_duration integer,p_haircut uuid,p_addons uuid[],p_exclude uuid)
returns table(slot_start timestamptz,barber_ids uuid[]) language sql stable security definer set search_path='' as $$
 select x.slot_start,array_agg(b.id order by b.id) from private.available_slots_for_offer(p_slug,p_service,p_barber,p_date,p_duration,p_haircut,p_exclude) x
 cross join lateral unnest(x.barber_ids) b(id) where private.barber_can_addons(b.id,p_addons)
 group by x.slot_start order by x.slot_start
$$;
revoke all on function private.available_slots_for_composition(text,uuid,uuid,date,integer,uuid,uuid[],uuid) from public,anon,authenticated;

create or replace function public.get_composed_available_slots(p_slug text,p_service_id uuid,p_barber_id uuid,p_date date,p_haircut_id uuid,p_addon_ids uuid[])
returns table(slot_start timestamptz,barber_ids uuid[]) language plpgsql stable security definer set search_path='' as $$
declare v_shop uuid; v_duration integer;
begin
 select id into v_shop from public.barbershops where slug=p_slug and status in ('trial','active');
 if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
 select o.duration_min into v_duration from private.resolve_booking_composition(v_shop,p_service_id,p_haircut_id,p_addon_ids) o;
 return query select * from private.available_slots_for_composition(p_slug,p_service_id,p_barber_id,p_date,v_duration,p_haircut_id,p_addon_ids,null);
end $$;
revoke all on function public.get_composed_available_slots(text,uuid,uuid,date,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.get_composed_available_slots(text,uuid,uuid,date,uuid,uuid[]) to anon,authenticated;

create or replace function private.composition_label(p_components jsonb,p_fallback text) returns text
language sql immutable set search_path='' as $$
 select coalesce((select string_agg(x.value->>'name',' + ' order by x.ord) from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) with ordinality x(value,ord)),p_fallback)
$$;
revoke all on function private.composition_label(jsonb,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_composed_available_days(p_slug text, p_service_id uuid, p_barber_id uuid, p_from date, p_to date, p_haircut_id uuid,p_addon_ids uuid[])
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
    from public.get_composed_available_slots(p_slug,p_service_id,p_barber_id,d,p_haircut_id,p_addon_ids);

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
          and private.barber_can_addons(b.id,p_addon_ids)
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
revoke all on function public.get_composed_available_days(text,uuid,uuid,date,date,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.get_composed_available_days(text,uuid,uuid,date,date,uuid,uuid[]) to anon,authenticated;
CREATE OR REPLACE FUNCTION private.book_composed_appointment_core(p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_source booking_source, p_created_by uuid, p_internal_note text,p_addon_ids uuid[],p_expected_price integer,p_expected_duration integer)
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
  v_composition record;
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

  perform 1 from public.service_addons m join public.services s on s.id=m.addon_service_id where m.service_id=p_service_id and m.addon_service_id=any(coalesce(p_addon_ids,'{}'::uuid[])) order by s.id for share of m,s;
  select * into v_composition from private.resolve_booking_composition(v_shop.id,p_service_id,p_haircut_id,p_addon_ids);
  v_svc.price_cents:=v_composition.price_cents; v_svc.duration_min:=v_composition.duration_min; v_svc.requires_deposit:=v_composition.requires_deposit;
  if (p_expected_price is not null and p_expected_price<>v_svc.price_cents) or (p_expected_duration is not null and p_expected_duration<>v_svc.duration_min) then raise exception 'BOOKING_QUOTE_CHANGED'; end if;

  v_slot_date := (p_start at time zone v_shop.timezone)::date;

  if p_barber_id is null then
    select (s.barber_ids)[1]
    into v_barber
    from private.available_slots_for_composition(
      btrim(p_slug),p_service_id,null,v_slot_date,v_svc.duration_min,p_haircut_id,p_addon_ids,null
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
    from private.available_slots_for_composition(
      btrim(p_slug),p_service_id,v_barber,v_slot_date,v_svc.duration_min,p_haircut_id,p_addon_ids,null
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
      confirmed_at,
      service_components
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
      case when v_status='confirmed' then now() else null end,
      v_composition.components
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
      'service_components',v_composition.components,
      'deposit_cents',v_dep,
      'needs_payment',(v_dep > 0)
    )
  );

  return query
  select v_id,v_tok,v_dep,(v_dep > 0);
end;
$function$;
revoke all on function private.book_composed_appointment_core(text,uuid,uuid,uuid,timestamptz,text,text,text,public.booking_source,uuid,text,uuid[],integer,integer) from public,anon,authenticated;
create or replace function private.book_appointment_core(p_slug text,p_service_id uuid,p_haircut_id uuid,p_barber_id uuid,p_start timestamptz,p_name text,p_phone text,p_email text,p_source public.booking_source,p_created_by uuid default null,p_internal_note text default null)
returns table(appointment_id uuid,manage_token uuid,deposit_cents integer,needs_payment boolean)
language sql security definer set search_path='' as $$
 select * from private.book_composed_appointment_core(p_slug,p_service_id,p_haircut_id,p_barber_id,p_start,p_name,p_phone,p_email,p_source,p_created_by,p_internal_note,'{}'::uuid[],null,null)
$$;
revoke all on function private.book_appointment_core(text,uuid,uuid,uuid,timestamptz,text,text,text,public.booking_source,uuid,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.book_composed_appointment_manual(p_shop uuid, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_internal_note text,p_addon_ids uuid[],p_expected_price integer,p_expected_duration integer)
 RETURNS TABLE(appointment_id uuid, manage_token uuid, barber_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, status appointment_status, deposit_cents integer, needs_payment boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  select b.slug into v_slug
  from public.barbershops b
  where b.id=p_shop;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select * into v_result
  from private.book_composed_appointment_core(
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
    p_internal_note,p_addon_ids,p_expected_price,p_expected_duration
  );

  return query
  select
    v_result.appointment_id,
    v_result.manage_token,
    a.barber_id,
    a.starts_at,
    a.ends_at,
    a.status,
    v_result.deposit_cents,
    v_result.needs_payment
  from public.appointments a
  where a.id=v_result.appointment_id
    and a.barbershop_id=p_shop;
end;
$function$;
revoke all on function public.book_composed_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,uuid[],integer,integer) from public,anon,authenticated;
grant execute on function public.book_composed_appointment_manual(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,uuid[],integer,integer) to authenticated;
CREATE OR REPLACE FUNCTION public.book_composed_appointment_with_shop_order_idempotent(p_idempotency_key uuid, p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_shop_items jsonb, p_request_hash text,p_addon_ids uuid[],p_expected_price integer,p_expected_duration integer)
 RETURNS TABLE(appointment_id uuid, manage_token uuid, deposit_cents integer, needs_payment boolean, shop_order_status shop_order_status, shop_order_item_count integer, shop_subtotal_minor bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cached jsonb;
  v_cached_hash text;
  v_response jsonb;
  v_cached_shop_order jsonb;
  v_booking record;
  v_shop public.barbershops%rowtype;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_options jsonb;
  v_fulfilment_mode text;
  v_variant record;
  v_order_id uuid;
  v_order_line_id uuid;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_item_count integer := 0;
  v_requested_count integer;
  v_distinct_variants bigint;
  v_reserved integer;
  v_order_status public.shop_order_status;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_FINGERPRINT';
  end if;
  if p_shop_items is null or jsonb_typeof(p_shop_items) is distinct from 'array' then
    raise exception 'INVALID_SHOP_ORDER_ITEMS';
  end if;
  if jsonb_array_length(p_shop_items) > 20 then
    raise exception 'SHOP_ORDER_TOO_MANY_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_shop_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'variant_id')
       or not (v_item ? 'qty')
       or not (v_item ? 'options')
       or not (v_item ? 'fulfilment_mode')
       or exists (
         select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key not in ('variant_id','qty','options','fulfilment_mode')
       ) then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'variant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'qty','') !~ '^[1-9][0-9]{0,2}$'
       or (v_item->>'qty')::integer > 100 then
      raise exception 'INVALID_SHOP_ORDER_QUANTITY';
    end if;
    v_options := v_item->'options';
    if not private.shop_order_options_valid(v_options) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if (select count(*) from jsonb_array_elements_text(v_options) e(value))
       <> (select count(distinct e.value) from jsonb_array_elements_text(v_options) e(value)) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if coalesce(v_item->>'fulfilment_mode','') not in ('consume_here','takeaway') then
      raise exception 'INVALID_SHOP_FULFILMENT_MODE';
    end if;
  end loop;

  select count(*), count(distinct lower(value->>'variant_id'))
    into v_requested_count, v_distinct_variants
  from jsonb_array_elements(p_shop_items);
  if v_requested_count <> v_distinct_variants then
    raise exception 'DUPLICATE_SHOP_ORDER_VARIANT';
  end if;

  -- Claim the same key used by booking-create. Conflicting requests cannot reuse a cached order.
  insert into public.booking_idempotency(key, response, request_hash)
  values (p_idempotency_key, null, p_request_hash)
  on conflict (key) do nothing;

  if not found then
    select bi.response, bi.request_hash
      into v_cached, v_cached_hash
    from public.booking_idempotency bi
    where bi.key = p_idempotency_key
    for update;

    if v_cached is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    if v_cached_hash is null then
      if jsonb_array_length(p_shop_items) > 0 or cardinality(coalesce(p_addon_ids,'{}'::uuid[]))>0 or p_expected_price is not null or p_expected_duration is not null then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
    elsif v_cached_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;

    v_cached_shop_order := v_cached->'shop_order';
    return query
    select
      (v_cached->>'appointment_id')::uuid,
      (v_cached->>'manage_token')::uuid,
      coalesce((v_cached->>'deposit_cents')::integer, 0),
      coalesce((v_cached->>'needs_payment')::boolean, false),
      case
        when v_cached_shop_order is null or v_cached_shop_order = 'null'::jsonb then null::public.shop_order_status
        else (v_cached_shop_order->>'status')::public.shop_order_status
      end,
      coalesce((v_cached_shop_order->>'item_count')::integer, 0),
      coalesce((v_cached_shop_order->>'subtotal_minor')::bigint, 0);
    return;
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    select b.*
      into v_shop
    from public.barbershops b
    where lower(b.slug) = lower(btrim(p_slug))
      and b.status in ('trial','active')
    for update;

    if not found then
      raise exception 'BARBERSHOP_NOT_FOUND';
    end if;
    if not coalesce(v_shop.shop_enabled, false) then
      raise exception 'SHOP_NOT_ENABLED';
    end if;
  end if;

  -- Reuse the existing authoritative engine. Any error below rolls this booking back.
  select * into v_booking
  from private.book_composed_appointment_core(
    p_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email,'online'::public.booking_source,null,null,p_addon_ids,p_expected_price,p_expected_duration
  );

  if not found or v_booking.manage_token is null then
    raise exception 'BOOKING_EMPTY_RESPONSE';
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    insert into public.appointment_product_orders(
      barbershop_id, appointment_id, status, customer_note
    )
    values (v_shop.id, v_booking.appointment_id, 'received', null)
    returning id into v_order_id;

    for v_item in select value from jsonb_array_elements(p_shop_items)
    loop
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_qty := (v_item->>'qty')::integer;
      v_options := v_item->'options';
      v_fulfilment_mode := v_item->>'fulfilment_mode';

      select
        v.id as variant_id,
        v.product_id,
        v.barbershop_id,
        v.label as variant_label,
        v.price_minor,
        v.stock_on_hand,
        v.is_active as variant_active,
        p.name as product_name,
        p.is_active as product_active,
        p.category_id,
        p.product_kind,
        p.track_stock,
        p.order_options
      into v_variant
      from public.shop_product_variants v
      join public.shop_products p
        on p.id = v.product_id
       and p.barbershop_id = v.barbershop_id
      where v.id = v_variant_id
        and v.barbershop_id = v_shop.id
        and v.is_active
        and p.is_active
        and (
          p.category_id is null or exists (
            select 1
            from public.shop_product_categories c
            where c.id = p.category_id
              and c.barbershop_id = v_shop.id
              and c.is_active
          )
        )
      for update of v, p;

      if not found then
        raise exception 'SHOP_ITEM_UNAVAILABLE';
      end if;

      if (v_variant.product_kind = 'consume_here' and v_fulfilment_mode <> 'consume_here')
         or (v_variant.product_kind = 'takeaway' and v_fulfilment_mode <> 'takeaway') then
        raise exception 'INVALID_SHOP_FULFILMENT_MODE';
      end if;

      if exists (
        select 1
        from jsonb_array_elements_text(v_options) requested(option_name)
        where not exists (
          select 1
          from jsonb_array_elements_text(v_variant.order_options) configured(option_name)
          where configured.option_name = requested.option_name
        )
      ) then
        raise exception 'INVALID_SHOP_ORDER_OPTIONS';
      end if;

      if v_variant.track_stock then
        select coalesce(sum(r.qty), 0)::integer
          into v_reserved
        from public.inventory_reservations r
        where r.barbershop_id = v_shop.id
          and r.variant_id = v_variant_id
          and r.status = 'reserved'
          and (r.expires_at is null or r.expires_at > now());

        if v_variant.stock_on_hand - v_reserved < v_qty then
          raise exception 'SHOP_STOCK_UNAVAILABLE';
        end if;
      end if;

      if v_variant.price_minor < 0 or v_variant.price_minor > 9007199254740991 then
        raise exception 'SHOP_PRICE_INVALID';
      end if;
      v_line_total := v_variant.price_minor * v_qty;
      if v_subtotal > 9007199254740991 - v_line_total then
        raise exception 'SHOP_TOTAL_OVERFLOW';
      end if;

      insert into public.appointment_product_order_items(
        barbershop_id,
        order_id,
        product_id,
        variant_id,
        product_name_snapshot,
        variant_snapshot,
        unit_price_snapshot,
        qty,
        options,
        line_total_snapshot,
        status
      )
      values (
        v_shop.id,
        v_order_id,
        v_variant.product_id,
        v_variant_id,
        v_variant.product_name,
        v_variant.variant_label,
        v_variant.price_minor,
        v_qty,
        jsonb_build_object('preferences', v_options, 'fulfilment_mode', v_fulfilment_mode),
        v_line_total,
        'requested'
      );

      if v_variant.track_stock then
        insert into public.inventory_reservations(
          barbershop_id, order_id, variant_id, qty, status, expires_at
        )
        values (v_shop.id, v_order_id, v_variant_id, v_qty, 'reserved', null);
      end if;

      v_subtotal := v_subtotal + v_line_total;
      v_item_count := v_item_count + 1;
    end loop;

    if v_item_count <> jsonb_array_length(p_shop_items) or v_item_count = 0 then
      raise exception 'SHOP_ORDER_EMPTY';
    end if;

    select case when exists(select 1 from public.appointment_product_order_items i join public.shop_products p on p.id=i.product_id and p.barbershop_id=i.barbershop_id where i.order_id=v_order_id and i.barbershop_id=v_shop.id and p.requires_confirmation) then 'needs_confirmation'::public.shop_order_status else 'received'::public.shop_order_status end into v_order_status;
    update public.appointment_product_orders set status=v_order_status where id=v_order_id and barbershop_id=v_shop.id;

    insert into public.audit_logs(
      barbershop_id, actor_id, action, entity, entity_id, diff
    )
    values (
      v_shop.id, null, 'shop_order_received', 'appointment_product_order', v_order_id,
      jsonb_build_object(
        'appointment_id', v_booking.appointment_id,
        'item_count', v_item_count,
        'subtotal_minor', v_subtotal,
        'inventory_reservations', (
          select count(*) from public.inventory_reservations r
          where r.order_id = v_order_id and r.status = 'reserved'
        )
      )
    );
  end if;

  v_response := jsonb_build_object(
    'appointment_id', v_booking.appointment_id,
    'manage_token', v_booking.manage_token,
    'deposit_cents', coalesce(v_booking.deposit_cents, 0),
    'needs_payment', coalesce(v_booking.needs_payment, false),
    'shop_order', case when v_order_id is null then null else jsonb_build_object(
      'status', v_order_status::text,
      'item_count', v_item_count,
      'subtotal_minor', v_subtotal
    ) end
  );

  update public.booking_idempotency
  set response = v_response, request_hash = p_request_hash
  where key = p_idempotency_key;

  return query
  select v_booking.appointment_id, v_booking.manage_token, coalesce(v_booking.deposit_cents, 0),
         coalesce(v_booking.needs_payment, false), v_order_status, v_item_count, v_subtotal;
end;
$function$;
revoke all on function public.book_composed_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text,uuid[],integer,integer) from public,anon,authenticated;
grant execute on function public.book_composed_appointment_with_shop_order_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,text,uuid[],integer,integer) to service_role;
CREATE OR REPLACE FUNCTION public.join_composed_waitlist(p_slug text, p_service_id uuid, p_customer_name text, p_phone text, p_haircut_id uuid,p_barber_id uuid,p_email text,p_date_from date,p_date_to date,p_period text,p_addon_ids uuid[])
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
  v_ids uuid[];
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

  perform * from private.resolve_booking_composition(sh.id,p_service_id,p_haircut_id,p_addon_ids);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_ids from unnest(coalesce(p_addon_ids,'{}'::uuid[])) a(id);
  if not exists(select 1 from public.barbers b join public.barber_services bs on bs.barber_id=b.id and bs.service_id=p_service_id where b.barbershop_id=sh.id and b.is_active and (p_barber_id is null or b.id=p_barber_id) and private.barber_can_style(sh.id,p_haircut_id,b.id) and private.barber_can_addons(b.id,v_ids)) then raise exception 'BARBER_NOT_FOUND'; end if;
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

  if left(v_phone,4) <> '+258' or length(v_phone) <> 13 or substring(v_phone,5,1) <> '8' or substring(v_phone,6,1) not between '2' and '7' or substring(v_phone,7,7) !~ '^[0-9]+
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
    p_service_id::text || ':' || coalesce(p_haircut_id::text,'none') || ':' || v_ids::text || ':' ||
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
    and w.haircut_id is not distinct from p_haircut_id and w.addon_service_ids=v_ids
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
    status,addon_service_ids
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
    'waiting',v_ids
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
 then
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
    p_service_id::text || ':' || coalesce(p_haircut_id::text,'none') || ':' || v_ids::text || ':' ||
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
    and w.haircut_id is not distinct from p_haircut_id and w.addon_service_ids=v_ids
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
    status,addon_service_ids
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
    'waiting',v_ids
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
revoke all on function public.join_composed_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text,uuid[]) from public,anon,authenticated;
grant execute on function public.join_composed_waitlist(text,uuid,text,text,uuid,uuid,text,date,date,text,uuid[]) to anon,authenticated;
create or replace function public.join_waitlist(p_slug text,p_service_id uuid,p_customer_name text,p_phone text,p_haircut_id uuid default null,p_barber_id uuid default null,p_email text default null,p_date_from date default null,p_date_to date default null,p_period text default 'any')
returns table(status public.waitlist_status,queued_at timestamptz) language sql security definer set search_path='' as $$
 select * from public.join_composed_waitlist(p_slug,p_service_id,p_customer_name,p_phone,p_haircut_id,p_barber_id,p_email,p_date_from,p_date_to,p_period,'{}'::uuid[])
$$;
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
  v_composition record;
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
    begin
    select * into v_composition from private.resolve_booking_composition(p_shop,w.service_id,w.haircut_id,w.addon_service_ids);
    select exists (
      select 1
      from private.available_slots_for_composition(
        sh.slug,
        w.service_id,
        p_barber_id,
        v_date,v_composition.duration_min,w.haircut_id,w.addon_service_ids,null
      ) av
      where av.slot_start=p_slot_start
    )
    into v_available;
    exception when raise_exception then
      if sqlerrm in ('INVALID_BOOKING_OFFER','HAIRCUT_NOT_FOUND','SERVICE_NOT_FOUND') then continue; else raise; end if;
    end;
    if v_available then
      v_offer_token := gen_random_uuid();
      v_expires := now() + interval '15 minutes';

      update public.waitlist_entries we
      set status='offered',
          offer_token=v_offer_token,
          offer_slot_start=p_slot_start,
          offer_barber_id=p_barber_id,
          offer_expires_at=v_expires,
          offer_composition=v_composition.components
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
CREATE OR REPLACE FUNCTION public.claim_waitlist_offer(p_token uuid)
 RETURNS TABLE(waitlist_entry_id uuid, appointment_id uuid, manage_token uuid, status appointment_status, starts_at timestamp with time zone, ends_at timestamp with time zone, barber_id uuid, deposit_cents integer, needs_payment boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w public.waitlist_entries%rowtype;
  sh public.barbershops%rowtype;
  r record;
  v_error text;
begin
  select *
  into w
  from public.waitlist_entries
  where offer_token=p_token
  for update;

  if not found then
    raise exception 'WAITLIST_OFFER_NOT_FOUND';
  end if;

  if w.status <> 'offered' then
    raise exception 'WAITLIST_OFFER_NOT_ACTIVE';
  end if;

  if w.offer_expires_at is null or w.offer_expires_at <= now() then
    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_OFFER_EXPIRED';
  end if;

  select b.*
  into sh
  from public.barbershops b
  where b.id=w.barbershop_id
    and b.status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  begin
    select *
    into r
    from private.book_composed_appointment_core(
      sh.slug,
      w.service_id,
      w.haircut_id,
      w.offer_barber_id,
      w.offer_slot_start,
      w.customer_name,
      w.phone,
      w.email,
      'waitlist'::public.booking_source,
      null,
      'Waitlist claim',w.addon_service_ids,
      (select sum((x->>'price_cents')::integer)::integer from jsonb_array_elements(w.offer_composition) x),
      (select sum((x->>'duration_min')::integer)::integer from jsonb_array_elements(w.offer_composition) x)
    );

    update public.waitlist_entries
    set status='converted'
    where id=w.id;

    update public.notifications n
    set status='skipped',
        error='waitlist_converted'
    where n.waitlist_entry_id=w.id
      and n.status='queued'
      and n.template_key='waitlist_offer';

    insert into public.audit_logs(
      barbershop_id,
      actor_id,
      action,
      entity,
      entity_id,
      diff
    )
    values(
      w.barbershop_id,
      auth.uid(),
      'waitlist_converted',
      'waitlist_entry',
      w.id,
      jsonb_build_object(
        'appointment_id',r.appointment_id,
        'slot_start',w.offer_slot_start
      )
    );

    return query
    select
      w.id,
      r.appointment_id,
      r.manage_token,
      (
        select a.status
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.starts_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.ends_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      w.offer_barber_id,
      r.deposit_cents,
      r.needs_payment;

    return;
  exception
    when others then
      v_error := sqlerrm;
  end;

  if position('SLOT_TAKEN' in coalesce(v_error,'')) > 0
     or position('SLOT_UNAVAILABLE' in coalesce(v_error,'')) > 0 then

    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_SLOT_TAKEN';
  end if;

  raise exception '%',v_error;
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
    (w.status='offered' and w.offer_expires_at > now() and private.style_matches_service(w.barbershop_id,w.service_id,w.haircut_id) and private.barber_can_style(w.barbershop_id,w.haircut_id,w.offer_barber_id) and private.barber_can_addons(w.offer_barber_id,w.addon_service_ids)) as can_claim,
    w.customer_name,
    private.composition_label(w.offer_composition,s.name),
    coalesce((select sum((x->>'price_cents')::integer)::integer from jsonb_array_elements(w.offer_composition) x),case when h.service_id=s.id then coalesce(h.price_cents,s.price_cents) else coalesce(o.price_cents,s.price_cents) end),
    coalesce((select sum((x->>'duration_min')::integer)::integer from jsonb_array_elements(w.offer_composition) x),case when h.service_id=s.id then coalesce(h.duration_min,s.duration_min) else coalesce(o.duration_min,s.duration_min) end),
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
CREATE OR REPLACE FUNCTION public.get_waitlist(p_shop uuid, p_status text DEFAULT 'active'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(waitlist_entry_id uuid, queue_position bigint, customer_name text, phone text, email text, service_name text, haircut_name text, barber_name text, date_from date, date_to date, period text, status waitlist_status, offer_slot_start timestamp with time zone, offer_barber_name text, offer_expires_at timestamp with time zone, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text := lower(btrim(coalesce(p_status,'active')));
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(btrim(coalesce(p_search,'')),'');
begin
  perform private.require_shop_operator(p_shop);

  if v_status not in ('active','waiting','offered','converted','expired','cancelled','all') then
    raise exception 'WAITLIST_STATUS_INVALID';
  end if;

  return query
  with base as (
    select
      w.*,
      count(*) filter (where w.status='waiting') over (
        partition by w.service_id
        order by w.created_at,w.id
        rows between unbounded preceding and current row
      ) as waiting_position
    from public.waitlist_entries w
    where w.barbershop_id=p_shop
      and (
        v_status='all'
        or (v_status='active' and w.status in ('waiting','offered'))
        or v_status=w.status::text
      )
      and (
        v_search is null
        or w.customer_name ilike '%' || v_search || '%'
        or w.phone ilike '%' || v_search || '%'
        or coalesce(w.email,'') ilike '%' || v_search || '%'
      )
  )
  select
    b0.id,
    case when b0.status='waiting' then b0.waiting_position else null end,
    b0.customer_name,
    b0.phone,
    b0.email,
    coalesce(private.composition_label(b0.offer_composition,null),s.name || coalesce((select ' + ' || string_agg(z.name,' + ' order by z.name) from public.services z where z.barbershop_id=b0.barbershop_id and z.id=any(b0.addon_service_ids)),'')),
    h.name,
    pb.display_name,
    b0.date_from,
    b0.date_to,
    b0.period,
    b0.status,
    b0.offer_slot_start,
    ob.display_name,
    b0.offer_expires_at,
    b0.created_at,
    count(*) over()::bigint
  from base b0
  join public.services s on s.id=b0.service_id
  left join public.haircuts h on h.id=b0.haircut_id
  left join public.barbers pb on pb.id=b0.barber_id
  left join public.barbers ob on ob.id=b0.offer_barber_id
  order by
    case b0.status when 'offered' then 0 when 'waiting' then 1 else 2 end,
    b0.created_at,
    b0.id
  limit v_limit
  offset v_offset;
end;
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

  if target_barber<>old_barber and (not private.barber_can_style(p_shop,a.haircut_id,target_barber) or not private.barber_can_addons(target_barber,array(select (x.value->>'service_id')::uuid from jsonb_array_elements(a.service_components) with ordinality x(value,ord) where x.ord>1))) then raise exception 'BARBER_NOT_FOUND'; end if;
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
          'addon_ids',coalesce((select jsonb_agg(m.addon_service_id order by m.addon_service_id) from public.service_addons m join public.services a on a.id=m.addon_service_id and a.is_active where m.service_id=s.id),'[]'::jsonb),
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
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(p_token uuid)
 RETURNS TABLE(shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, shop_address text, shop_maps_url text, timezone text, cancellation_rule cancellation_rule, customer_name text, appointment_starts_at timestamp with time zone, appointment_ends_at timestamp with time zone, appointment_status appointment_status, deposit_status deposit_state, deposit_cents integer, service_name text, service_price_cents integer, service_duration_min integer, haircut_name text, barber_name text, barber_photo_url text, can_cancel boolean, can_reschedule boolean, action_deadline timestamp with time zone, hold_expires_at timestamp with time zone, payment_methods payment_provider[], latest_payment_status payment_state, latest_payment_failure_code text, latest_payment_failure_reason text, latest_payment_requires_refund boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    sh.name,sh.slug,sh.phone,sh.whatsapp,sh.address,sh.maps_url,sh.timezone,sh.cancellation_rule,
    c.name,a.starts_at,a.ends_at,a.status,a.deposit_status,a.deposit_cents,
    private.composition_label(a.service_components,s.name),a.price_cents,a.duration_min,h.name,b.display_name,b.photo_url,
    (
      a.status in ('pending','confirmed') and a.starts_at>now() and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    (
      a.status in ('pending','confirmed') and a.starts_at>now()
      and (a.deposit_status<>'awaiting' or a.hold_expires_at is null or a.hold_expires_at>now())
      and sh.cancellation_rule<>'contact_only'
      and case sh.cancellation_rule
        when 'flex_2h' then now()<=a.starts_at-interval '2 hours'
        when 'moderate_6h' then now()<=a.starts_at-interval '6 hours'
        when 'strict_24h' then now()<=a.starts_at-interval '24 hours'
        else false
      end
    ),
    case sh.cancellation_rule
      when 'flex_2h' then a.starts_at-interval '2 hours'
      when 'moderate_6h' then a.starts_at-interval '6 hours'
      when 'strict_24h' then a.starts_at-interval '24 hours'
      else null end,
    a.hold_expires_at,
    coalesce((
      select array_agg(pa.provider order by pa.provider)
      from public.payment_accounts pa
      where pa.barbershop_id=sh.id and pa.enabled=true and pa.credential_secret_id is not null
    ),'{}'::public.payment_provider[]),
    lp.status,lp.failure_code,lp.failure_reason,lp.requires_refund
  from public.appointments a
  join public.barbershops sh on sh.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services s on s.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join lateral (
    select p.* from public.payments p where p.appointment_id=a.id order by p.created_at desc limit 1
  ) lp on true
  where a.manage_token=p_token;
$function$;
CREATE OR REPLACE FUNCTION public.get_agenda_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(appointment_id uuid, barber_id uuid, barber_name text, barber_photo_url text, customer_name text, customer_phone text, customer_email text, service_id uuid, service_name text, haircut_id uuid, haircut_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, duration_min integer, price_cents integer, status appointment_status, deposit_status deposit_state, deposit_cents integer, hold_expires_at timestamp with time zone, source booking_source, manage_token uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to - p_from > interval '14 days' then raise exception 'AGENDA_RANGE_TOO_LARGE'; end if;
  perform private.require_agenda_access(p_shop);

  return query
  select a.id,b.id,b.display_name,b.photo_url,c.name,c.phone,c.email,
         a.service_id,private.composition_label(a.service_components,s.name),a.haircut_id,h.name,a.starts_at,a.ends_at,a.duration_min,
         a.price_cents,a.status,a.deposit_status,a.deposit_cents,a.hold_expires_at,
         a.source,a.manage_token
  from public.appointments a
  join public.barbers b on b.id=a.barber_id and b.barbershop_id=a.barbershop_id
  join public.customers c on c.id=a.customer_id and c.barbershop_id=a.barbershop_id
  join public.services s on s.id=a.service_id and s.barbershop_id=a.barbershop_id
  left join public.haircuts h on h.id=a.haircut_id and h.barbershop_id=a.barbershop_id
  where a.barbershop_id=p_shop
    and a.starts_at>=p_from
    and a.starts_at<p_to
    and (
      private.is_platform_admin()
      or private.is_member(p_shop,array['owner','manager']::public.app_role[])
      or (private.is_member(p_shop,array['barber']::public.app_role[]) and a.barber_id=private.my_barber_id(p_shop))
    )
  order by a.starts_at,b.sort_order,c.name;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_appointments(p_shop uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_status appointment_status DEFAULT NULL::appointment_status, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(appointment_id uuid, barber_id uuid, barber_name text, customer_id uuid, customer_name text, customer_phone text, customer_email text, service_id uuid, service_name text, haircut_id uuid, haircut_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, duration_min integer, price_cents integer, status appointment_status, deposit_status deposit_state, deposit_cents integer, hold_expires_at timestamp with time zone, source booking_source, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  if p_to - p_from > interval '90 days' then
    raise exception 'AGENDA_RANGE_TOO_LARGE';
  end if;

  if v_limit < 1 or v_limit > 100 then
    raise exception 'INVALID_LIMIT';
  end if;

  perform private.require_agenda_access(p_shop);

  return query
  select
    a.id,
    b.id,
    b.display_name,
    c.id,
    c.name,
    c.phone,
    c.email,
    a.service_id,
    private.composition_label(a.service_components,s.name),
    a.haircut_id,
    h.name,
    a.starts_at,
    a.ends_at,
    a.duration_min,
    a.price_cents,
    a.status,
    a.deposit_status,
    a.deposit_cents,
    a.hold_expires_at,
    a.source,
    count(*) over()
  from public.appointments a
  join public.barbers b
    on b.id = a.barber_id
   and b.barbershop_id = a.barbershop_id
  join public.customers c
    on c.id = a.customer_id
   and c.barbershop_id = a.barbershop_id
  join public.services s
    on s.id = a.service_id
   and s.barbershop_id = a.barbershop_id
  left join public.haircuts h
    on h.id = a.haircut_id
   and h.barbershop_id = a.barbershop_id
  where a.barbershop_id = p_shop
    and a.starts_at >= p_from
    and a.starts_at < p_to
    and (p_status is null or a.status = p_status)
    and (
      v_search is null
      or c.name ilike '%' || v_search || '%'
      or c.phone ilike '%' || v_search || '%'
      or coalesce(c.email, '') ilike '%' || v_search || '%'
      or s.name ilike '%' || v_search || '%'
      or b.display_name ilike '%' || v_search || '%'
    )
    and (
      private.is_platform_admin()
      or private.is_member(p_shop, array['owner','manager']::public.app_role[])
      or (
        private.is_member(p_shop, array['barber']::public.app_role[])
        and a.barber_id = private.my_barber_id(p_shop)
      )
    )
  order by a.starts_at desc, b.sort_order, c.name
  limit v_limit
  offset v_offset;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_customer_appointments(p_shop uuid, p_customer uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(appointment_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, status appointment_status, service_name text, haircut_name text, barber_name text, price_cents integer, source booking_source, deposit_status deposit_state, deposit_cents integer, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    private.composition_label(a.service_components,s.name),
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
CREATE OR REPLACE FUNCTION public.get_customer(p_shop uuid, p_customer uuid)
 RETURNS TABLE(customer_id uuid, name text, phone text, email text, notes text, preferences jsonb, visits_count integer, no_show_count integer, last_visit_at timestamp with time zone, next_appointment_at timestamp with time zone, next_appointment_status appointment_status, last_service_name text, last_haircut_name text, last_barber_name text, total_spend_cents bigint, total_appointments bigint, completed_appointments bigint, cancelled_appointments bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    case when v_is_barber then count(a.id) filter (where a.status='completed')::integer else c.visits_count end,
    case when v_is_barber then count(a.id) filter (where a.status='no_show')::integer else c.no_show_count end,
    case when v_is_barber then max(a.completed_at) filter (where a.status='completed') else c.last_visit_at end,
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
      select private.composition_label(a.service_components,s.name)
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
CREATE OR REPLACE FUNCTION public.get_customers(p_shop uuid, p_search text DEFAULT NULL::text, p_view text DEFAULT 'all'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, name text, phone text, email text, notes text, preferences jsonb, visits_count integer, no_show_count integer, last_visit_at timestamp with time zone, next_appointment_at timestamp with time zone, next_appointment_status appointment_status, last_service_name text, last_haircut_name text, total_spend_cents bigint, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        select private.composition_label(a.service_components,s.name)
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
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(p_shop uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz text;
  v_today date;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_month_from_ts timestamptz;
  v_barber uuid;
  v_is_barber boolean;
  v_today_count bigint;
  v_booked_minutes numeric;
  v_capacity_minutes numeric;
  v_revenue_cents bigint;
  v_no_shows bigint;
  v_pending_deposit bigint;
  v_waiting bigint;
  v_new_reviews bigint;
  v_has_barbers boolean;
  v_next jsonb;
begin
  if p_shop is null then
    raise exception 'SHOP_REQUIRED';
  end if;

  perform private.require_agenda_access(p_shop);

  select s.timezone
    into v_tz
  from public.barbershops s
  where s.id=p_shop;

  if v_tz is null then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber := private.my_barber_id(p_shop);
    if v_barber is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  v_today := (now() at time zone v_tz)::date;
  v_from_ts := v_today::timestamp at time zone v_tz;
  v_to_ts := (v_today + 1)::timestamp at time zone v_tz;
  v_month_from_ts := date_trunc('month', v_today::timestamp) at time zone v_tz;

  select count(*)::bigint
    into v_today_count
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and a.status<>'cancelled'
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(a.duration_min) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::numeric
    into v_booked_minutes
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select coalesce(sum(capacity_minutes),0)::numeric
    into v_capacity_minutes
  from private.report_capacity_by_day(
    p_shop,
    v_today,
    v_today,
    v_barber
  );

  select coalesce(sum(a.price_cents) filter (
           where a.status not in ('cancelled','no_show')
         ),0)::bigint
    into v_revenue_cents
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_no_shows
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='no_show'
    and a.starts_at>=v_month_from_ts
    and (not v_is_barber or a.barber_id=v_barber);

  select count(*)::bigint
    into v_pending_deposit
  from public.appointments a
  where a.barbershop_id=p_shop
    and a.status='pending'
    and a.deposit_status='awaiting'
    and a.starts_at>=v_from_ts
    and a.starts_at<v_to_ts
    and (not v_is_barber or a.barber_id=v_barber);

  if v_is_barber then
    v_waiting := 0;
  else
    select count(*)::bigint
      into v_waiting
    from public.waitlist_entries w
    where w.barbershop_id=p_shop
      and w.status='waiting';
  end if;

  select count(*)::bigint
    into v_new_reviews
  from public.reviews r
  where r.barbershop_id=p_shop
    and r.created_at>=now()-interval '7 days'
    and (not v_is_barber or r.barber_id=v_barber);

  select exists(
    select 1
    from public.barbers b
    where b.barbershop_id=p_shop
      and b.is_active
      and (not v_is_barber or b.id=v_barber)
  )
  into v_has_barbers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'appointment_id', x.id,
        'starts_at', x.starts_at,
        'status', x.status,
        'customer_name', x.customer_name,
        'service_name', x.service_name,
        'haircut_name', x.haircut_name,
        'barber_name', x.barber_name
      )
      order by x.starts_at
    ),
    '[]'::jsonb
  )
    into v_next
  from (
    select
      a.id,
      a.starts_at,
      a.status,
      c.name as customer_name,
      private.composition_label(a.service_components,s.name) as service_name,
      h.name as haircut_name,
      b.display_name as barber_name
    from public.appointments a
    join public.customers c
      on c.id=a.customer_id
     and c.barbershop_id=a.barbershop_id
    join public.services s
      on s.id=a.service_id
     and s.barbershop_id=a.barbershop_id
    left join public.haircuts h
      on h.id=a.haircut_id
     and h.barbershop_id=a.barbershop_id
    join public.barbers b
      on b.id=a.barber_id
     and b.barbershop_id=a.barbershop_id
    where a.barbershop_id=p_shop
      and a.starts_at>=now()
      and a.starts_at<v_to_ts
      and a.status in ('pending','confirmed')
      and (not v_is_barber or a.barber_id=v_barber)
    order by a.starts_at
    limit 5
  ) x;

  return jsonb_build_object(
    'today', v_today_count,
    'occupancy', case
      when v_capacity_minutes>0
        then round(least(100::numeric,(v_booked_minutes/v_capacity_minutes)*100),2)
      else null
    end,
    'revenue', v_revenue_cents,
    'noShows', v_no_shows,
    'pendingDeposit', v_pending_deposit,
    'waiting', v_waiting,
    'newReviews', v_new_reviews,
    'hasBarbers', v_has_barbers,
    'next', v_next
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_review_by_token(p_token uuid)
 RETURNS TABLE(shop_name text, shop_slug text, timezone text, customer_name text, appointment_status appointment_status, appointment_completed_at timestamp with time zone, service_name text, haircut_name text, barber_name text, barber_photo_url text, available_at timestamp with time zone, has_review boolean, rating integer, comment text, review_is_published boolean, review_created_at timestamp with time zone, can_submit boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_token is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  return query
  select
    s.name,
    s.slug,
    s.timezone,
    c.name,
    a.status,
    a.completed_at,
    private.composition_label(a.service_components,svc.name),
    h.name,
    b.display_name,
    b.photo_url,
    case
      when a.completed_at is null then null
      else a.completed_at + interval '1 hour'
    end,
    r.id is not null,
    r.rating,
    r.comment,
    r.is_published,
    r.created_at,
    (
      a.status='completed'
      and a.completed_at is not null
      and now() >= a.completed_at + interval '1 hour'
      and r.id is null
    )
  from public.appointments a
  join public.barbershops s on s.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services svc on svc.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join public.reviews r on r.appointment_id=a.id
  where a.manage_token=p_token;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
end;
$function$;
