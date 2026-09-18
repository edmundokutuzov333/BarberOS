-- Phase 19 mutation alias hardening.
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
  select p.* into v_old from public.plans p where p.id=p_plan for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if not p_is_active and exists(select 1 from public.barbershops s where s.plan_id=p_plan) then raise exception 'PLAN_IN_USE'; end if;
  update public.plans set name=trim(p_name),price_cents=p_price_cents,max_barbers=p_max_barbers,features=p_features,is_active=p_is_active where public.plans.id=p_plan;
  insert into public.audit_logs(actor_id,action,entity,entity_id,diff)
  values(auth.uid(),'admin_plan_updated','plan',p_plan,jsonb_build_object('from',jsonb_build_object('name',v_old.name,'price_cents',v_old.price_cents,'max_barbers',v_old.max_barbers,'features',v_old.features,'is_active',v_old.is_active),'to',jsonb_build_object('name',trim(p_name),'price_cents',p_price_cents,'max_barbers',p_max_barbers,'features',p_features,'is_active',p_is_active)));
  return query select p.id,p.code,p.name,p.price_cents,p.max_barbers,p.features,p.is_active from public.plans p where p.id=p_plan;
end;
$$;
revoke all on function public.admin_update_plan(uuid,text,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_plan(uuid,text,integer,integer,jsonb,boolean) to authenticated;

create or replace function public.admin_create_support_ticket(p_shop uuid,p_subject text,p_description text,p_priority public.support_ticket_priority default 'normal')
returns table(id uuid,subject text,status public.support_ticket_status,priority public.support_ticket_priority,created_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_ticket_id uuid;
begin
  perform private.require_platform_admin();
  if p_shop is not null and not exists(select 1 from public.barbershops s where s.id=p_shop) then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  insert into public.support_tickets(barbershop_id,created_by,subject,description,priority)
  values(p_shop,auth.uid(),trim(p_subject),trim(p_description),p_priority)
  returning public.support_tickets.id into v_ticket_id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'admin_support_ticket_created','support_ticket',v_ticket_id,jsonb_build_object('priority',p_priority,'subject',trim(p_subject)));
  return query select t.id,t.subject,t.status,t.priority,t.created_at from public.support_tickets t where t.id=v_ticket_id;
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
  select t.* into v_before from public.support_tickets t where t.id=p_ticket for update;
  if not found then raise exception 'SUPPORT_TICKET_NOT_FOUND'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.profiles pr where pr.id=p_assigned_to and pr.is_platform_admin) then raise exception 'SUPPORT_ASSIGNEE_INVALID'; end if;
  update public.support_tickets t
  set status=coalesce(p_status,t.status),priority=coalesce(p_priority,t.priority),assigned_to=case when p_assigned_to is null then t.assigned_to else p_assigned_to end
  where t.id=p_ticket returning t.* into v_after;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(v_after.barbershop_id,auth.uid(),'admin_support_ticket_updated','support_ticket',p_ticket,jsonb_build_object('status_from',v_before.status,'status_to',v_after.status,'priority_from',v_before.priority,'priority_to',v_after.priority,'assigned_to_from',v_before.assigned_to,'assigned_to_to',v_after.assigned_to));
  return query select v_after.id,v_after.status,v_after.priority,v_after.assigned_to,v_after.updated_at;
end;
$$;
revoke all on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid) to authenticated;