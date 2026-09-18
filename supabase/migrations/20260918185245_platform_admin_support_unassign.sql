-- Phase 19 hardening: allow explicit support ticket assignee removal.
create or replace function public.admin_update_support_ticket(
  p_ticket uuid,p_status public.support_ticket_status default null,p_priority public.support_ticket_priority default null,
  p_assigned_to uuid default null,p_clear_assignee boolean default false
)
returns table(id uuid,status public.support_ticket_status,priority public.support_ticket_priority,assigned_to uuid,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_before public.support_tickets%rowtype; v_after public.support_tickets%rowtype;
begin
  perform private.require_platform_admin();
  select t.* into v_before from public.support_tickets t where t.id=p_ticket for update;
  if not found then raise exception 'SUPPORT_TICKET_NOT_FOUND'; end if;
  if p_clear_assignee and p_assigned_to is not null then raise exception 'SUPPORT_ASSIGNEE_INVALID'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.profiles pr where pr.id=p_assigned_to and pr.is_platform_admin) then raise exception 'SUPPORT_ASSIGNEE_INVALID'; end if;
  update public.support_tickets t set
    status=coalesce(p_status,t.status),
    priority=coalesce(p_priority,t.priority),
    assigned_to=case when p_clear_assignee then null else coalesce(p_assigned_to,t.assigned_to) end
  where t.id=p_ticket returning t.* into v_after;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(v_after.barbershop_id,auth.uid(),'admin_support_ticket_updated','support_ticket',p_ticket,jsonb_build_object(
    'status_from',v_before.status,'status_to',v_after.status,
    'priority_from',v_before.priority,'priority_to',v_after.priority,
    'assigned_to_from',v_before.assigned_to,'assigned_to_to',v_after.assigned_to
  ));
  return query select v_after.id,v_after.status,v_after.priority,v_after.assigned_to,v_after.updated_at;
end;
$$;
revoke all on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_update_support_ticket(uuid,public.support_ticket_status,public.support_ticket_priority,uuid,boolean) to authenticated;