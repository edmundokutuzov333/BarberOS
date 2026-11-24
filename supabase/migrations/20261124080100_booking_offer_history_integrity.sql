-- Preserve the historical commercial pair when an existing reservation is moved.
-- Never waive tenant integrity, and enforce explicit compatibility for all new writes.
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
          if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.service_id=new.service_id and h.is_active) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        elsif new.haircut_id is distinct from old.haircut_id or new.service_id is distinct from old.service_id then
          if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.service_id=new.service_id and h.is_active) then
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
          if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.service_id=new.service_id and h.is_active) then
            raise exception 'HAIRCUT_NOT_FOUND';
          end if;
        elsif new.haircut_id is distinct from old.haircut_id or new.service_id is distinct from old.service_id then
          if not exists(select 1 from public.haircuts h where h.id=new.haircut_id and h.service_id=new.service_id and h.is_active) then
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
CREATE OR REPLACE FUNCTION private.link_reference_haircuts(p_shop uuid,p_haircuts uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  with mapping(style,service) as (values
    ('low fade','degradê / fade'),('mid fade','degradê / fade'),('high fade','degradê / fade'),
    ('taper fade','degradê / fade'),('skin fade','degradê / fade'),('drop fade','degradê / fade'),
    ('burst fade','degradê / fade'),('buzz cut','corte clássico'),('crew cut','corte clássico'),
    ('caesar','corte clássico'),('french crop','corte clássico'),('pompadour','corte clássico'),
    ('quiff','corte clássico'),('slick back','corte clássico'),('afro shape-up','contorno / line-up'),
    ('waves','waves e escova'),('twists','manutenção de dreads e twists'),
    ('dreads retwist','manutenção de dreads e twists'),('corte à tesoura','corte à tesoura'),
    ('corte infantil','corte infantil'),('careca à navalha','raspagem à navalha'),('design freestyle','design freestyle')
  ), candidates as (
    select h.id haircut_id,(array_agg(s.id order by s.id))[1] service_id
    from public.haircuts h join mapping m on lower(btrim(h.name))=m.style
    join public.services s on s.barbershop_id=h.barbershop_id and s.is_active and lower(btrim(s.name))=m.service
    where h.service_id is null and (p_shop is null or h.barbershop_id=p_shop)
      and (p_haircuts is null or h.id=any(p_haircuts))
    group by h.id having count(*)=1
  )
  update public.haircuts h set service_id=c.service_id from candidates c
  where h.id=c.haircut_id and h.service_id is null;
  get diagnostics n=row_count;
  return n;
end;
$function$;
revoke all on function private.link_reference_haircuts(uuid,uuid[]) from public,anon,authenticated;
create or replace function private.link_reference_haircuts(p_shop uuid default null)
returns integer language sql security definer set search_path='' as $$
  select private.link_reference_haircuts(p_shop,null::uuid[])
$$;
revoke all on function private.link_reference_haircuts(uuid) from public,anon,authenticated;
select private.link_reference_haircuts();
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
  if n>0 then perform private.link_reference_haircuts(p_shop,created_ids); end if;
  return n;
end $function$;
