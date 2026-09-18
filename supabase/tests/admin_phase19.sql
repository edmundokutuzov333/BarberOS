-- BarberOS Phase 19: platform admin acceptance tests.
begin;
do $$
declare
  v_admin uuid; v_nonadmin uuid; v_shop uuid; v_plan uuid; v_status public.shop_status; v_ticket uuid; v_err text; v_plan_row record; v_json jsonb;
begin
  select id into v_admin from public.profiles where is_platform_admin limit 1;
  select id into v_nonadmin from public.profiles where not is_platform_admin limit 1;
  select s.id,s.status,s.plan_id into v_shop,v_status,v_plan from public.barbershops s order by s.created_at limit 1;
  if v_admin is null or v_shop is null or v_plan is null then raise exception 'ADMIN_FIXTURE_UNAVAILABLE'; end if;

  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  select public.admin_get_overview() into v_json;
  if not (v_json ? 'shops') or not (v_json ? 'payments') or not (v_json ? 'support') then raise exception 'ADMIN_OVERVIEW_FAILED'; end if;

  perform public.admin_list_barbershops(null,null,50,0);
  perform public.admin_list_users(null,50,0);
  perform public.admin_list_plans();
  perform public.admin_list_payments(null,null,null,50,0);
  perform public.admin_list_support_tickets(null,null,null,50,0);
  perform public.admin_get_activity(10);
  select public.admin_get_metrics(current_date-6,current_date) into v_json;
  if not (v_json ? 'daily') or not (v_json ? 'plans') then raise exception 'ADMIN_METRICS_FAILED'; end if;
  perform public.admin_get_barbershop(v_shop);

  perform public.admin_set_barbershop_status(v_shop,case when v_status='suspended' then 'active'::public.shop_status else 'suspended'::public.shop_status end);
  perform public.admin_set_barbershop_status(v_shop,v_status);
  perform public.admin_assign_barbershop_plan(v_shop,v_plan);
  select p.* into v_plan_row from public.plans p where p.id=v_plan;
  perform public.admin_update_plan(v_plan,v_plan_row.name,v_plan_row.price_cents,v_plan_row.max_barbers,v_plan_row.features,v_plan_row.is_active);

  select id into v_ticket from public.admin_create_support_ticket(v_shop,'Phase 19 acceptance','Transient administrative support ticket.','high'::public.support_ticket_priority);
  perform public.admin_update_support_ticket(v_ticket,'in_progress'::public.support_ticket_status,'urgent'::public.support_ticket_priority,v_admin,false);
  if not exists(select 1 from public.support_tickets st where st.id=v_ticket and st.status='in_progress' and st.priority='urgent' and st.assigned_to=v_admin) then raise exception 'ADMIN_SUPPORT_WRITE_FAILED'; end if;
  perform public.admin_update_support_ticket(v_ticket,null,null,null,true);
  if exists(select 1 from public.support_tickets st where st.id=v_ticket and st.assigned_to is not null) then raise exception 'ADMIN_SUPPORT_UNASSIGN_FAILED'; end if;

  if v_nonadmin is not null then
    perform set_config('request.jwt.claim.sub',v_nonadmin::text,true);
    begin
      perform public.admin_get_overview();
      raise exception 'ADMIN_READ_PERMISSION_BREACHED';
    exception when others then
      get stacked diagnostics v_err=message_text;
      if v_err<>'PLATFORM_ADMIN_REQUIRED' then raise; end if;
    end;
    begin
      perform public.admin_set_barbershop_status(v_shop,'active');
      raise exception 'ADMIN_WRITE_PERMISSION_BREACHED';
    exception when others then
      get stacked diagnostics v_err=message_text;
      if v_err<>'PLATFORM_ADMIN_REQUIRED' then raise; end if;
    end;
  end if;
end $$;

select
  not has_table_privilege('authenticated','public.support_tickets','insert') as support_direct_insert_blocked,
  not exists(select 1 from pg_policies where schemaname='public' and tablename='barbershops' and policyname='shop_admin') as shop_admin_policy_removed,
  not exists(select 1 from pg_policies where schemaname='public' and tablename='plans' and policyname='plans_admin') as plans_admin_policy_removed,
  not has_function_privilege('anon','public.admin_get_overview()','execute') as anon_admin_blocked;

rollback;