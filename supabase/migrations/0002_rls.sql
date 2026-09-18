-- BarberOS — Fase 1: funções de segurança e RLS
create or replace function public.is_member(p_shop uuid, p_roles app_role[] default array['owner','manager','barber']::app_role[])
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from barbershop_members m
    where m.barbershop_id=p_shop and m.user_id=auth.uid() and m.role=any(p_roles));
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select is_platform_admin from profiles where id=auth.uid()),false);
$$;

create or replace function public.my_barber_id(p_shop uuid) returns uuid
language sql stable security definer set search_path=public as $$
  select id from barbers where barbershop_id=p_shop and user_id=auth.uid() limit 1;
$$;

create or replace function public.shop_is_public(p_shop uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from barbershops where id=p_shop and status in ('active','trial'));
$$;

-- criar barbearia: insere a barbearia, o membro owner e o horário base (seg–sáb 09:00–19:00)
create or replace function public.create_barbershop(p_name text, p_slug text, p_phone text default null, p_whatsapp text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_plan uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if length(btrim(p_name))<2 then raise exception 'INVALID_NAME'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'INVALID_SLUG'; end if;
  if exists(select 1 from barbershops where slug=p_slug) then raise exception 'SLUG_TAKEN'; end if;
  select id into v_plan from plans where code='starter';
  insert into barbershops(name,slug,phone,whatsapp,plan_id)
  values (btrim(p_name),p_slug,nullif(p_phone,''),nullif(p_whatsapp,''),v_plan) returning id into v_id;
  insert into barbershop_members(barbershop_id,user_id,role) values (v_id,auth.uid(),'owner');
  insert into working_hours(barbershop_id,weekday,opens_at,closes_at,is_closed)
  select v_id, d, '09:00','19:00', d=0 from generate_series(0,6) d;
  insert into audit_logs(barbershop_id,actor_id,action,entity,entity_id)
  values (v_id,auth.uid(),'barbershop.created','barbershops',v_id);
  return v_id;
end $$;
grant execute on function public.create_barbershop(text,text,text,text) to authenticated;

-- RLS em todas as tabelas
alter table profiles            enable row level security;
alter table plans               enable row level security;
alter table barbershops         enable row level security;
alter table barbershop_members  enable row level security;
alter table barbers             enable row level security;
alter table services            enable row level security;
alter table barber_services     enable row level security;
alter table haircuts            enable row level security;
alter table working_hours       enable row level security;
alter table time_blocks         enable row level security;
alter table customers           enable row level security;
alter table appointments        enable row level security;
alter table waitlist_entries    enable row level security;
alter table reviews             enable row level security;
alter table payments            enable row level security;
alter table notifications       enable row level security;
alter table audit_logs          enable row level security;

-- limpar políticas antigas (idempotente)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy prof_read   on profiles for select using (id=auth.uid() or is_platform_admin());
create policy prof_update on profiles for update using (id=auth.uid()) with check (id=auth.uid() and is_platform_admin() = (select is_platform_admin from profiles p where p.id=auth.uid()));
create policy prof_admin  on profiles for all using (is_platform_admin()) with check (is_platform_admin());

-- plans
create policy plans_read  on plans for select using (is_active or is_platform_admin());
create policy plans_admin on plans for all using (is_platform_admin()) with check (is_platform_admin());

-- barbershops
create policy shop_public_read on barbershops for select using (status in ('active','trial'));
create policy shop_member_read on barbershops for select using (is_member(id) or is_platform_admin());
create policy shop_owner_update on barbershops for update
  using (is_member(id, array['owner','manager']::app_role[]))
  with check (is_member(id, array['owner','manager']::app_role[]));
create policy shop_admin on barbershops for all using (is_platform_admin()) with check (is_platform_admin());

-- barbershop_members
create policy mem_read  on barbershop_members for select using (user_id=auth.uid() or is_member(barbershop_id, array['owner','manager']::app_role[]) or is_platform_admin());
create policy mem_write on barbershop_members for all
  using (is_member(barbershop_id, array['owner']::app_role[]) or is_platform_admin())
  with check (is_member(barbershop_id, array['owner']::app_role[]) or is_platform_admin());

-- barbers
create policy barbers_public_read on barbers for select using ((is_active and shop_is_public(barbershop_id)) or is_member(barbershop_id) or is_platform_admin());
create policy barbers_write on barbers for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));
create policy barbers_self_update on barbers for update
  using (user_id=auth.uid()) with check (user_id=auth.uid());

-- services
create policy services_public_read on services for select using ((is_active and shop_is_public(barbershop_id)) or is_member(barbershop_id) or is_platform_admin());
create policy services_write on services for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- barber_services
create policy bs_read on barber_services for select using (
  exists(select 1 from barbers b where b.id=barber_id and (shop_is_public(b.barbershop_id) or is_member(b.barbershop_id))));
create policy bs_write on barber_services for all
  using (exists(select 1 from barbers b where b.id=barber_id and is_member(b.barbershop_id, array['owner','manager']::app_role[])))
  with check (exists(select 1 from barbers b where b.id=barber_id and is_member(b.barbershop_id, array['owner','manager']::app_role[])));

-- haircuts
create policy haircuts_public_read on haircuts for select using ((is_active and shop_is_public(barbershop_id)) or is_member(barbershop_id) or is_platform_admin());
create policy haircuts_write on haircuts for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- working_hours
create policy wh_public_read on working_hours for select using (shop_is_public(barbershop_id) or is_member(barbershop_id) or is_platform_admin());
create policy wh_write on working_hours for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- time_blocks
create policy tb_read on time_blocks for select using (is_member(barbershop_id) or is_platform_admin());
create policy tb_write on time_blocks for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));
create policy tb_barber_own on time_blocks for all
  using (is_member(barbershop_id, array['barber']::app_role[]) and barber_id=my_barber_id(barbershop_id))
  with check (is_member(barbershop_id, array['barber']::app_role[]) and barber_id=my_barber_id(barbershop_id));

-- customers
create policy cust_read  on customers for select using (is_member(barbershop_id) or is_platform_admin());
create policy cust_write on customers for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- appointments
create policy appt_read on appointments for select using (
  is_platform_admin()
  or is_member(barbershop_id, array['owner','manager']::app_role[])
  or (is_member(barbershop_id, array['barber']::app_role[])
      and barber_id = my_barber_id(barbershop_id))
);
create policy appt_write on appointments for all using (
  is_member(barbershop_id, array['owner','manager']::app_role[])
) with check (
  is_member(barbershop_id, array['owner','manager']::app_role[])
);
create policy appt_barber_update on appointments for update using (
  is_member(barbershop_id, array['barber']::app_role[])
  and barber_id = my_barber_id(barbershop_id)
) with check (
  status in ('in_progress','completed','no_show')
);

-- waitlist
create policy wl_read  on waitlist_entries for select using (is_member(barbershop_id) or is_platform_admin());
create policy wl_write on waitlist_entries for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- reviews
create policy rev_public_read on reviews for select using ((is_published and shop_is_public(barbershop_id)) or is_member(barbershop_id) or is_platform_admin());
create policy rev_write on reviews for all
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));

-- payments / notifications / audit
create policy pay_read  on payments for select using (is_member(barbershop_id, array['owner','manager']::app_role[]) or is_platform_admin());
create policy pay_admin on payments for all using (is_platform_admin()) with check (is_platform_admin());
create policy notif_read  on notifications for select using (is_member(barbershop_id, array['owner','manager']::app_role[]) or is_platform_admin());
create policy notif_update on notifications for update
  using (is_member(barbershop_id, array['owner','manager']::app_role[]))
  with check (is_member(barbershop_id, array['owner','manager']::app_role[]));
create policy audit_read on audit_logs for select using (is_member(barbershop_id, array['owner']::app_role[]) or is_platform_admin());
create policy audit_insert on audit_logs for insert with check (is_member(barbershop_id));

-- anon: só leitura via políticas públicas; garantir que não há grants extra
revoke insert, update, delete on appointments, customers, payments, notifications, audit_logs, waitlist_entries from anon;

-- Storage: buckets públicos de leitura, escrita por membros no path {barbershop_id}/...
insert into storage.buckets(id,name,public) values
  ('shop-logos','shop-logos',true),('shop-photos','shop-photos',true),
  ('barbers','barbers',true),('haircuts','haircuts',true)
on conflict (id) do nothing;

drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects for select
  using (bucket_id in ('shop-logos','shop-photos','barbers','haircuts'));
drop policy if exists storage_member_write on storage.objects;
create policy storage_member_write on storage.objects for all
  using (bucket_id in ('shop-logos','shop-photos','barbers','haircuts')
         and is_member(((storage.foldername(name))[1])::uuid, array['owner','manager']::app_role[]))
  with check (bucket_id in ('shop-logos','shop-photos','barbers','haircuts')
         and is_member(((storage.foldername(name))[1])::uuid, array['owner','manager']::app_role[]));
