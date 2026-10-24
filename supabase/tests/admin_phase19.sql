-- BarberOS Phase 19: platform admin acceptance tests.
begin;
do $$
declare
  v_admin uuid;
  v_nonadmin uuid := gen_random_uuid();
  v_shop uuid;
  v_plan uuid;
  v_status public.shop_status;
  v_ticket uuid;
  v_err text;
  v_plan_row record;
  v_json jsonb;
begin
  -- Phase 23 acceptance setup creates this user and shop on the ephemeral
  -- database. Promote only that disposable fixture user for this transaction.
  select id into v_admin
  from public.profiles
  where id=(select u.id from auth.users u where u.email='phase23-owner@example.invalid')
  limit 1;
  if v_admin is null then raise exception 'ADMIN_FIXTURE_OWNER_MISSING'; end if;

  update public.profiles set is_platform_admin=true where id=v_admin;

  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_nonadmin, 'authenticated', 'authenticated', 'phase19-nonadmin@example.invalid', '',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

  select s.id,s.status
    into v_shop,v_status
  from public.barbershops s
  where s.slug='phase23-acceptance-fixture'
  limit 1;

  if v_shop is null then
    raise exception 'ADMIN_FIXTURE_SHOP_MISSING';
  end if;

  select p.id into v_plan
  from public.plans p
  where p.is_active
  order by p.price_cents,p.code
  limit 1;

  -- A clean migration-only database has no commercial plan rows. Provide one
  -- test-only plan if needed, inside this contract's BEGIN/ROLLBACK, instead
  -- of relying on seed data from a pre-existing development environment.
  if v_plan is null then
    insert into public.plans(code,name,price_cents,max_barbers,features,is_active)
    values (
      'phase19-acceptance-' || left(replace(gen_random_uuid()::text,'-',''),12),
      'Phase 19 Acceptance Plan',
      12000,
      10,
      '{}'::jsonb,
      true
    )
    returning id into v_plan;
  end if;

  -- The shared fixture intentionally does not own a plan. Assign an active
  -- plan inside this test transaction; the outer ROLLBACK restores all rows.
  update public.barbershops set plan_id=v_plan where id=v_shop;

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