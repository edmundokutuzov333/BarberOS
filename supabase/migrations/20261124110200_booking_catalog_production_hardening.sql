-- Starter packages, immutable snapshots and valid waitlist quotes.
create or replace function private.seed_secondary_style_offers(p_shop uuid,p_haircuts uuid[] default null,p_new_service uuid default null)
returns void language sql security definer set search_path='' as $$
 insert into public.haircut_service_offers(barbershop_id,haircut_id,service_id,price_cents,duration_min)
 select h.barbershop_id,h.id,s.id,null,null
 from public.haircuts h join public.services base on base.id=h.service_id and base.barbershop_id=h.barbershop_id
 join public.services s on s.barbershop_id=h.barbershop_id and lower(btrim(s.name)) in ('corte + barba','corte premium + barba') and s.is_active
 where h.barbershop_id=p_shop and h.is_active and base.is_active and h.service_id<>s.id
 and lower(btrim(base.name)) in ('corte clássico','degradê / fade','corte à tesoura')
 and lower(btrim(h.name)) in ('low fade','mid fade','high fade','taper fade','skin fade','drop fade','burst fade','buzz cut','crew cut','caesar','french crop','pompadour','quiff','slick back','corte à tesoura')
 and (p_haircuts is null or h.id=any(p_haircuts)) and (p_new_service is null or s.id=p_new_service)
 on conflict do nothing;
$$;
revoke all on function private.seed_secondary_style_offers(uuid,uuid[],uuid) from public,anon,authenticated;
select private.seed_secondary_style_offers(id) from public.barbershops;
create or replace function private.composition_quote_current(p_shop uuid,p_service uuid,p_haircut uuid,p_addons uuid[],p_snapshot jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare c record;
begin
 select * into c from private.resolve_booking_composition(p_shop,p_service,p_haircut,p_addons);
 return p_snapshot is null or (c.price_cents=(select sum((x->>'price_cents')::int) from jsonb_array_elements(p_snapshot) x) and c.duration_min=(select sum((x->>'duration_min')::int) from jsonb_array_elements(p_snapshot) x));
exception when others then
 if sqlerrm in ('INVALID_BOOKING_OFFER','SERVICE_NOT_FOUND','HAIRCUT_NOT_FOUND') then return false; end if;
 raise;
end $$;
revoke all on function private.composition_quote_current(uuid,uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
create or replace function private.prevent_service_component_change() returns trigger language plpgsql set search_path='' as $$
begin if old.service_components is distinct from new.service_components then raise exception 'APPOINTMENT_COMPONENTS_IMMUTABLE'; end if; return new; end $$;
revoke all on function private.prevent_service_component_change() from public,anon,authenticated;
create trigger prevent_service_component_change before update of service_components on public.appointments for each row execute function private.prevent_service_component_change();
CREATE OR REPLACE FUNCTION public.seed_haircut_catalogue(p_shop uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int; created_ids uuid[];
begin
  if not private.is_member(p_shop, array['owner','manager']::public.app_role[]) then raise exception 'FORBIDDEN'; end if;
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
    ('Careca à navalha','Rapado total com navalha.',22)), inserted as (
  insert into haircuts(barbershop_id,name,description,sort_order)
  select p_shop, c.name, c.description, c.ord from c
  where not exists (select 1 from haircuts h where h.barbershop_id=p_shop and lower(h.name)=lower(c.name)) returning id)
  select count(*)::int,coalesce(array_agg(id),'{}'::uuid[]) into n,created_ids from inserted;
  if n>0 then perform private.link_reference_haircuts(p_shop,created_ids); perform private.seed_secondary_style_offers(p_shop,created_ids); end if;
  return n;
end $function$
;
CREATE OR REPLACE FUNCTION private.seed_new_service_addons()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin perform private.seed_service_addons(new.barbershop_id,new.id); perform private.seed_secondary_style_offers(new.barbershop_id,null,new.id); return new; end $function$
;
CREATE OR REPLACE FUNCTION public.get_waitlist_offer(p_token uuid)
 RETURNS TABLE(status waitlist_status, can_claim boolean, customer_name text, service_name text, service_price_cents integer, service_duration_min integer, haircut_name text, barber_name text, slot_start timestamp with time zone, offer_expires_at timestamp with time zone, shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, timezone text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    w.status,
    (w.status='offered' and w.offer_expires_at > now() and private.style_matches_service(w.barbershop_id,w.service_id,w.haircut_id) and private.barber_can_style(w.barbershop_id,w.haircut_id,w.offer_barber_id) and private.barber_can_addons(w.offer_barber_id,w.addon_service_ids) and s.is_active and b.is_active and exists(select 1 from public.barber_services bs where bs.barber_id=w.offer_barber_id and bs.service_id=w.service_id) and private.composition_quote_current(w.barbershop_id,w.service_id,w.haircut_id,w.addon_service_ids,w.offer_composition)) as can_claim,
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
$function$
;
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

  if v_error in ('BOOKING_QUOTE_CHANGED','INVALID_BOOKING_OFFER','SERVICE_NOT_FOUND','HAIRCUT_NOT_FOUND','BARBER_NOT_FOUND') then raise exception 'WAITLIST_OFFER_NOT_ACTIVE'; end if;
  raise exception '%',v_error;
end;
$function$
;
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
      or private.composition_label(a.service_components,s.name) ilike '%' || v_search || '%'
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
$function$
;
CREATE OR REPLACE FUNCTION public.get_report_services(p_shop uuid, p_from date, p_to date, p_barber_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(service_id uuid, service_name text, appointment_count bigint, completed_count bigint, cancelled_count bigint, no_show_count bigint, booked_minutes numeric, estimated_revenue_cents bigint, paid_deposit_cents bigint, average_completed_ticket_cents numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tz text;
  v_barber uuid;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_to-p_from > 366 then raise exception 'REPORT_RANGE_TOO_LARGE'; end if;
  v_barber := private.resolve_report_barber(p_shop,p_barber_id);
  select timezone into v_tz from public.barbershops where id=p_shop;
  v_from_ts := p_from::timestamp at time zone v_tz;
  v_to_ts := (p_to+1)::timestamp at time zone v_tz;

  return query
  with filtered as (
    select a.* from public.appointments a where a.barbershop_id=p_shop and a.starts_at>=v_from_ts and a.starts_at<v_to_ts and (v_barber is null or a.barber_id=v_barber)
  ), lines as (
    select a.id,a.status,a.deposit_status,case when x.ord=1 then a.deposit_cents else 0 end as deposit_cents,
      (x.item->>'service_id')::uuid as sid,x.item->>'name' as sname,(x.item->>'price_cents')::int as price_cents,(x.item->>'duration_min')::int as duration_min
    from filtered a cross join lateral jsonb_array_elements(a.service_components) with ordinality x(item,ord)
    union all
    select a.id,a.status,a.deposit_status,a.deposit_cents,a.service_id,s.name,a.price_cents,a.duration_min
    from filtered a join public.services s on s.id=a.service_id and s.barbershop_id=p_shop where jsonb_array_length(a.service_components)=0
  ), catalogue as (
    select s.id,s.name,s.sort_order from public.services s where s.barbershop_id=p_shop
    union all
    select l.sid,max(l.sname),2147483647 from lines l where not exists(select 1 from public.services s where s.id=l.sid and s.barbershop_id=p_shop) group by l.sid
  )
  select s.id,s.name,count(l.id)::bigint,count(l.id) filter(where l.status='completed')::bigint,
    count(l.id) filter(where l.status='cancelled')::bigint,count(l.id) filter(where l.status='no_show')::bigint,
    coalesce(sum(l.duration_min) filter(where l.status<>'cancelled'),0)::numeric,
    coalesce(sum(l.price_cents) filter(where l.status='completed'),0)::bigint,
    coalesce(sum(l.deposit_cents) filter(where l.deposit_status='paid'),0)::bigint,
    round(coalesce(avg(l.price_cents) filter(where l.status='completed'),0),2)
  from catalogue s left join lines l on l.sid=s.id
  group by s.id,s.name,s.sort_order
  order by coalesce(sum(l.price_cents) filter(where l.status='completed'),0) desc,s.sort_order,s.name;
end;
$function$;
