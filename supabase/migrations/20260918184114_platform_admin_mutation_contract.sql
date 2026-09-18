-- Phase 19 mutation contract hardening.
create or replace function public.admin_set_barbershop_status(p_shop uuid,p_status public.shop_status)
returns table(id uuid,status public.shop_status)
language plpgsql security definer set search_path=''
as $$
declare v_old_status public.shop_status;
begin
  perform private.require_platform_admin();
  select s.status into v_old_status from public.barbershops s where s.id=p_shop for update;
  if v_old_status is null then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  if v_old_status=p_status then return query select p_shop,v_old_status; return; end if;
  update public.barbershops set status=p_status where public.barbershops.id=p_shop;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'admin_barbershop_status_changed','barbershop',p_shop,jsonb_build_object('from',v_old_status,'to',p_status));
  return query select p_shop,p_status;
end;
$$;
revoke all on function public.admin_set_barbershop_status(uuid,public.shop_status) from public,anon,authenticated;
grant execute on function public.admin_set_barbershop_status(uuid,public.shop_status) to authenticated;

create or replace function public.admin_assign_barbershop_plan(p_shop uuid,p_plan uuid)
returns table(shop_id uuid,plan_id uuid,plan_code text,plan_name text)
language plpgsql security definer set search_path=''
as $$
declare v_old_plan_id uuid; v_plan public.plans%rowtype;
begin
  perform private.require_platform_admin();
  select s.plan_id into v_old_plan_id from public.barbershops s where s.id=p_shop for update;
  if not found then raise exception 'BARBERSHOP_NOT_FOUND'; end if;
  select p.* into v_plan from public.plans p where p.id=p_plan;
  if not found or not v_plan.is_active then raise exception 'PLAN_NOT_ACTIVE'; end if;
  if (select count(*) from public.barbers br where br.barbershop_id=p_shop and br.is_active)>v_plan.max_barbers then raise exception 'PLAN_BARBER_LIMIT_TOO_LOW'; end if;
  update public.barbershops set plan_id=p_plan where public.barbershops.id=p_shop;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
  values(p_shop,auth.uid(),'admin_barbershop_plan_changed','barbershop',p_shop,jsonb_build_object('from_plan_id',v_old_plan_id,'to_plan_id',p_plan));
  return query select p_shop,v_plan.id,v_plan.code,v_plan.name;
end;
$$;
revoke all on function public.admin_assign_barbershop_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_assign_barbershop_plan(uuid,uuid) to authenticated;