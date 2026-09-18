-- BarberOS Phase 19: Oryon platform administration domain.
-- Privileged administration is enforced in SECURITY DEFINER RPCs.

create type public.support_ticket_status as enum ('open','in_progress','resolved','closed');
create type public.support_ticket_priority as enum ('low','normal','high','urgent');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid references public.barbershops(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  subject text not null,
  description text not null,
  priority public.support_ticket_priority not null default 'normal',
  status public.support_ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint support_ticket_subject_len check (char_length(trim(subject)) between 3 and 180),
  constraint support_ticket_description_len check (char_length(trim(description)) between 3 and 5000)
);

create index support_tickets_status_priority_idx on public.support_tickets(status,priority,created_at desc);
create index support_tickets_shop_idx on public.support_tickets(barbershop_id,created_at desc);
create index support_tickets_assignee_idx on public.support_tickets(assigned_to,status,created_at desc);

create or replace function private.touch_support_ticket()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at=now();
  if new.status in ('resolved','closed') and old.status not in ('resolved','closed') then
    new.resolved_at=coalesce(new.resolved_at,now());
  elsif new.status not in ('resolved','closed') then new.resolved_at=null;
  end if;
  return new;
end;
$$;

create trigger support_tickets_touch before update on public.support_tickets
for each row execute function private.touch_support_ticket();

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon,authenticated;
drop policy if exists support_tickets_platform on public.support_tickets;

create or replace function private.require_platform_admin()
returns void language plpgsql security definer stable set search_path=''
as $$
begin
  if not private.is_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
end;
$$;
revoke all on function private.require_platform_admin() from public,anon,authenticated;

create or replace function public.admin_get_overview()
returns jsonb language plpgsql security definer stable set search_path=''
as $$
declare v_result jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'shops',jsonb_build_object(
      'total',(select count(*) from public.barbershops),
      'trial',(select count(*) from public.barbershops where status='trial'),
      'active',(select count(*) from public.barbershops where status='active'),
      'suspended',(select count(*) from public.barbershops where status='suspended'),
      'cancelled',(select count(*) from public.barbershops where status='cancelled')
    ),
    'users',(select count(*) from public.profiles),
    'barbers',(select count(*) from public.barbers where is_active),
    'customers',(select count(*) from public.customers),
    'appointments',jsonb_build_object(
      'total',(select count(*) from public.appointments),
      'completed',(select count(*) from public.appointments where status='completed'),
      'cancelled',(select count(*) from public.appointments where status='cancelled'),
      'no_show',(select count(*) from public.appointments where status='no_show')
    ),
    'revenue',jsonb_build_object(
      'estimated_completed_cents',coalesce((select sum(price_cents) from public.appointments where status='completed'),0),
      'paid_deposit_cents',coalesce((select sum(deposit_cents) from public.appointments where deposit_status='paid'),0)
    ),
    'payments',jsonb_build_object(
      'total',(select count(*) from public.payments),
      'paid',(select count(*) from public.payments where status='paid'),
      'pending',(select count(*) from public.payments where status='pending'),
      'failed',(select count(*) from public.payments where status='failed'),
      'refund_required',(select count(*) from public.payments where requires_refund)
    ),
    'reviews',jsonb_build_object(
      'total',(select count(*) from public.reviews),
      'published',(select count(*) from public.reviews where is_published)
    ),
    'support',jsonb_build_object(
      'open',(select count(*) from public.support_tickets where status='open'),
      'in_progress',(select count(*) from public.support_tickets where status='in_progress'),
      'resolved',(select count(*) from public.support_tickets where status='resolved'),
      'closed',(select count(*) from public.support_tickets where status='closed')
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_get_overview() from public,anon,authenticated;
grant execute on function public.admin_get_overview() to authenticated;

create or replace function public.admin_list_barbershops(p_search text default null,p_status public.shop_status default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,name text,slug text,status public.shop_status,plan_id uuid,plan_code text,plan_name text,plan_price_cents integer,created_at timestamptz,member_count bigint,barber_count bigint,customer_count bigint,appointment_count bigint,total_count bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return query
  with base as (
    select s.*,p.code plan_code_value,p.name plan_name_value,p.price_cents plan_price_value,count(*) over() total_count_value
    from public.barbershops s left join public.plans p on p.id=s.plan_id
    where (p_status is null or s.status=p_status)
      and (nullif(trim(p_search),'') is null or s.name ilike '%'||trim(p_search)||'%' or s.slug ilike '%'||trim(p_search)||'%')
    order by s.created_at desc,s.name limit p_limit offset p_offset
  )
  select b.id,b.name,b.slug,b.status,b.plan_id,b.plan_code_value,b.plan_name_value,b.plan_price_value,b.created_at,
    (select count(*) from public.barbershop_members m where m.barbershop_id=b.id),
    (select count(*) from public.barbers br where br.barbershop_id=b.id),
    (select count(*) from public.customers c where c.barbershop_id=b.id),
    (select count(*) from public.appointments a where a.barbershop_id=b.id),
    b.total_count_value
  from base b order by b.created_at desc,b.name;
end;
$$;
revoke all on function public.admin_list_barbershops(text,public.shop_status,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_barbershops(text,public.shop_status,integer,integer) to authenticated;

create or replace function public.admin_get_barbershop(p_shop uuid)
returns jsonb language plpgsql security definer stable set search_path=''
as $$
declare v_result jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'shop',to_jsonb(s)-'plan_id',
    'plan',case when p.id is null then null else jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'price_cents',p.price_cents,'max_barbers',p.max_barbers,'features',p.features,'is_active',p.is_active) end,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'full_name',pr.full_name,'phone',pr.phone) order by m.created_at) from public.barbershop_members m left join public.profiles pr on pr.id=m.user_id where m.barbershop_id=s.id),'[]'::jsonb),
    'stats',jsonb_build_object(
      'barbers',(select count(*) from public.barbers where barbershop_id=s.id),
      'active_barbers',(select count(*) from public.barbers where barbershop_id=s.id and is_active),
      'customers',(select count(*) from public.customers where barbershop_id=s.id),
      'appointments',(select count(*) from public.appointments where barbershop_id=s.id),
      'completed_appointments',(select count(*) from public.appointments where barbershop_id=s.id and status='completed'),
      'reviews',(select count(*) from public.reviews where barbershop_id=s.id),
      'payments',(select count(*) from public.payments where barbershop_id=s.id)
    ),
    'activity',coalesce((select jsonb_agg(jsonb_build_object('action',al.action,'entity',al.entity,'entity_id',al.entity_id,'actor_id',al.actor_id,'created_at',al.created_at,'diff',al.diff) order by al.created_at desc) from (select * from public.audit_logs where barbershop_id=s.id order by created_at desc limit 20) al),'[]'::jsonb)
  ) into v_result
  from public.barbershops s left join public.plans p on p.id=s.plan_id where s.id=p_shop;
  if v_result is null then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  return v_result;
end;
$$;
revoke all on function public.admin_get_barbershop(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_barbershop(uuid) to authenticated;

create or replace function public.admin_set_barbershop_status(p_shop uuid,p_status public.shop_status)
returns table(id uuid,status public.shop_status)
language plpgsql security definer set search_path=''
as $$
declare v_old public.shop_status;
begin
  perform private.require_platform_admin();
  select status into v_old from public.barbershops where id=p_shop for update;
  if v_old is null then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  if v_old=p_status then return query select p_shop,v_old; return; end if;
  update public.barbershops set status=p_status where id=p_shop;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'admin_barbershop_status_changed','barbershop',p_shop,jsonb_build_object('from',v_old,'to',p_status));
  return query select p_shop,p_status;
end;
$$;
revoke all on function public.admin_set_barbershop_status(uuid,public.shop_status) from public,anon,authenticated;
grant execute on function public.admin_set_barbershop_status(uuid,public.shop_status) to authenticated;

create or replace function public.admin_assign_barbershop_plan(p_shop uuid,p_plan uuid)
returns table(shop_id uuid,plan_id uuid,plan_code text,plan_name text)
language plpgsql security definer set search_path=''
as $$
declare v_old uuid; v_plan public.plans%rowtype;
begin
  perform private.require_platform_admin();
  select plan_id into v_old from public.barbershops where id=p_shop for update;
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  select * into v_plan from public.plans where id=p_plan;
  if not found or not v_plan.is_active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if (select count(*) from public.barbers where barbershop_id=p_shop and is_active)>v_plan.max_barbers then raise exception 'PLAN_BARBER_LIMIT_TOO_LOW'; end if;
  update public.barbershops set plan_id=p_plan where id=p_shop;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'admin_barbershop_plan_changed','barbershop',p_shop,jsonb_build_object('from_plan_id',v_old,'to_plan_id',p_plan));
  return query select p_shop,v_plan.id,v_plan.code,v_plan.name;
end;
$$;
revoke all on function public.admin_assign_barbershop_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_assign_barbershop_plan(uuid,uuid) to authenticated;

create or replace function public.admin_list_users(p_search text default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,email text,full_name text,phone text,avatar_url text,is_platform_admin boolean,is_confirmed boolean,last_sign_in_at timestamptz,created_at timestamptz,shop_count bigint,shop_roles jsonb,total_count bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return query
  with base as (
    select pr.*,u.email::text user_email,(u.confirmed_at is not null) confirmed_value,u.last_sign_in_at,count(*) over() total_count_value
    from public.profiles pr join auth.users u on u.id=pr.id
    where nullif(trim(p_search),'') is null or pr.full_name ilike '%'||trim(p_search)||'%' or pr.phone ilike '%'||trim(p_search)||'%' or u.email ilike '%'||trim(p_search)||'%'
    order by pr.created_at desc limit p_limit offset p_offset
  )
  select b.id,b.user_email::text,b.full_name,b.phone,b.avatar_url,b.is_platform_admin,b.confirmed_value,b.last_sign_in_at,b.created_at,
    (select count(*) from public.barbershop_members m where m.user_id=b.id),
    coalesce((select jsonb_agg(jsonb_build_object('shop_id',m.barbershop_id,'shop_name',s.name,'role',m.role) order by s.name) from public.barbershop_members m join public.barbershops s on s.id=m.barbershop_id where m.user_id=b.id),'[]'::jsonb),
    b.total_count_value
  from base b order by b.created_at desc,b.full_name nulls last,b.user_email;
end;
$$;
revoke all on function public.admin_list_users(text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;

create or replace function public.admin_list_plans()
returns table(id uuid,code text,name text,price_cents integer,max_barbers integer,features jsonb,is_active boolean,assigned_shops bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  return query select p.id,p.code,p.name,p.price_cents,p.max_barbers,p.features,p.is_active,(select count(*) from public.barbershops s where s.plan_id=p.id) from public.plans p order by p.price_cents,p.name;
end;
$$;
revoke all on function public.admin_list_plans() from public,anon,authenticated;
grant execute on function public.admin_list_plans() to authenticated;

create or replace function public.admin_update_plan(p_plan uuid,p_name text,p_price_cents integer,p_max_barbers integer,p_features jsonb,p_is_active boolean)
returns table(id uuid,code text,name text,price_cents integer,max_barbers integer,features jsonb,is_active boolean)
language plpgsql security definer set search_path=''
as $$
declare v_old public.plans%rowtype;
begin
  perform private.require_platform_admin();
  if p_name is null or char_length(trim(p_name))<2 or char_length(trim(p_name))>80 then raise exception 'INVALID_PLAN_NAME'; end if;
  if p_price_cents<0 then raise exception 'INVALID_PLAN_PRICE'; end if;
  if p_max_barbers<1 or p_max_barbers>1000 then raise exception 'INVALID_MAX_BARBERS'; end if;
  if p_features is null or jsonb_typeof(p_features)<>'object' then raise exception 'INVALID_PLAN_FEATURES'; end if;
  select * into v_old from public.plans where id=p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not p_is_active and exists(select 1 from public.barbershops where plan_id=p_plan) then raise exception 'PLAN_IN_USE'; end if;
  update public.plans set name=trim(p_name),price_cents=p_price_cents,max_barbers=p_max_barbers,features=p_features,is_active=p_is_active where id=p_plan;
  insert into public.audit_logs(actor_id,action,entity,entity_id,diff)
  values(auth.uid(),'admin_plan_updated','plan',p_plan,jsonb_build_object(
    'from',jsonb_build_object('name',v_old.name,'price_cents',v_old.price_cents,'max_barbers',v_old.max_barbers,'features',v_old.features,'is_active',v_old.is_active),
    'to',jsonb_build_object('name',trim(p_name),'price_cents',p_price_cents,'max_barbers',p_max_barbers,'features',p_features,'is_active',p_is_active)
  ));
  return query select p.id,p.code,p.name,p.price_cents,p.max_barbers,p.features,p.is_active from public.plans p where p.id=p_plan;
end;
$$;
revoke all on function public.admin_update_plan(uuid,text,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_plan(uuid,text,integer,integer,jsonb,boolean) to authenticated;

create or replace function public.admin_list_payments(p_search text default null,p_status public.payment_state default null,p_provider public.payment_provider default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,shop_id uuid,shop_name text,appointment_id uuid,provider public.payment_provider,amount_cents integer,status public.payment_state,provider_ref text,provider_transaction_id text,requires_refund boolean,paid_at timestamptz,failed_at timestamptz,created_at timestamptz,total_count bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return query
  with base as (
    select pay.*,s.name shop_name_value,count(*) over() total_count_value
    from public.payments pay join public.barbershops s on s.id=pay.barbershop_id
    where (p_status is null or pay.status=p_status) and (p_provider is null or pay.provider=p_provider)
      and (nullif(trim(p_search),'') is null or s.name ilike '%'||trim(p_search)||'%' or pay.provider_ref ilike '%'||trim(p_search)||'%' or pay.provider_transaction_id ilike '%'||trim(p_search)||'%')
    order by pay.created_at desc limit p_limit offset p_offset
  )
  select b.id,b.barbershop_id,b.shop_name_value,b.appointment_id,b.provider,b.amount_cents,b.status,b.provider_ref,b.provider_transaction_id,b.requires_refund,b.paid_at,b.failed_at,b.created_at,b.total_count_value from base b order by b.created_at desc;
end;
$$;
revoke all on function public.admin_list_payments(text,public.payment_state,public.payment_provider,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_payments(text,public.payment_state,public.payment_provider,integer,integer) to authenticated;

create or replace function public.admin_list_support_tickets(p_search text default null,p_status public.support_ticket_status default null,p_priority public.support_ticket_priority default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,barbershop_id uuid,shop_name text,created_by uuid,created_by_name text,assigned_to uuid,assigned_to_name text,subject text,description text,priority public.support_ticket_priority,status public.support_ticket_status,created_at timestamptz,updated_at timestamptz,resolved_at timestamptz,total_count bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return query
  with base as (
    select t.*,s.name shop_name_value,pc.full_name created_by_name_value,pa.full_name assigned_to_name_value,count(*) over() total_count_value
    from public.support_tickets t left join public.barbershops s on s.id=t.barbershop_id left join public.profiles pc on pc.id=t.created_by left join public.profiles pa on pa.id=t.assigned_to
    where (p_status is null or t.status=p_status) and (p_priority is null or t.priority=p_priority)
      and (nullif(trim(p_search),'') is null or t.subject ilike '%'||trim(p_search)||'%' or t.description ilike '%'||trim(p_search)||'%' or s.name ilike '%'||trim(p_search)||'%')
    order by t.updated_at desc limit p_limit offset p_offset
  )
  select b.id,b.barbershop_id,b.shop_name_value,b.created_by,b.created_by_name_value,b.assigned_to,b.assigned_to_name_value,b.subject,b.description,b.priority,b.status,b.created_at,b.updated_at,b.resolved_at,b.total_count_value from base b order by b.updated_at desc;
end;
$$;
revoke all on function public.admin_list_support_tickets(text,public.support_ticket_status,public.support_ticket_priority,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_support_tickets(text,public.support_ticket_status,public.support_ticket_priority,integer,integer) to authenticated;

create or replace function public.admin_create_support_ticket(p_shop uuid,p_subject text,p_description text,p_priority public.support_ticket_priority default 'normal')
returns table(id uuid,subject text,status public.support_ticket_status,priority public.support_ticket_priority,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  perform private.require_platform_admin();
  if p_shop is not null and not exists(select 1 from public.barbershops where id=p_shop) then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  insert into public.support_tickets(barbershop_id,created_by,subject,description,priority) values(p_shop,auth.uid(),trim(p_subject),trim(p_description),p_priority) returning id into v_id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'admin_support_ticket_created','support_ticket',v_id,jsonb_build_object('priority',p_priority,'subject',trim(p_subject)));
  return query select t.id,t.subject,t.status,t.priority,t.created_at from public.support_tickets t where t.id=v_id;
end;
$$;
revoke all on function public.admin_create_support_ticket(uuid,text,text,public.support_ticket_priority) from public,anon,authenticated;
grant execute on function public.admin_create_support_ticket(uuid,text,text,public.support_ticket_priority) to authenticated;

create or replace function public.admin_update_support_ticket(p_ticket uuid,p_status public.support_ticket_status default null,p_priority public.support_ticket_priority default null,p_assigned_to uuid default null)
returns table(id uuid,status public.support_ticket_status,priority public.support_ticket_priority,assigned_to uuid,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_before public.support_tickets%rowtype; v_after public.support_tickets%rowtype;
begin
  perform private.require_platform_admin();
  select * into v_before from public.support_tickets where id=p_ticket for update;
  if not found then raise exception 'SUPPORT_TICKET_NOT_FOUND'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and is_platform_admin) then raise exception 'SUPPORT_ASSIGNEE_INVALID'; end if;
  update public.support_tickets set status=coalesce(p_status,status),priority=coalesce(p_priority,priority),assigned_to=case when p_assigned_to is null then assigned_to else p_assigned_to end where id=p_ticket returning * into v_after;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(v_after.barbershop_id,auth.uid(),'admin_support_ticket_updated','support_ticket',p_ticket,jsonb_build_object('status_from',v_before.status,'status_to',v_after.status,'priority_from',v_before.priority,'priority_to',v_after.priority,'assigned_to_from',v_before.assigned_to,'assigned_to_to',v_after.assigned_to));
  return query select v_after.id,v_after.status,v_after.priority,v_after.assigned_to,v_after.updated_at;
end;
$$;
revoke all on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid) to authenticated;

create or replace function public.admin_get_activity(p_limit integer default 30)
returns table(id uuid,barbershop_id uuid,shop_name text,actor_id uuid,action text,entity text,entity_id uuid,diff jsonb,created_at timestamptz)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  return query select a.id,a.barbershop_id,s.name,a.actor_id,a.action,a.entity,a.entity_id,a.diff,a.created_at from public.audit_logs a left join public.barbershops s on s.id=a.barbershop_id order by a.created_at desc limit p_limit;
end;
$$;
revoke all on function public.admin_get_activity(integer) from public,anon,authenticated;
grant execute on function public.admin_get_activity(integer) to authenticated;

drop policy if exists shop_admin on public.barbershops;
drop policy if exists plans_admin on public.plans;
