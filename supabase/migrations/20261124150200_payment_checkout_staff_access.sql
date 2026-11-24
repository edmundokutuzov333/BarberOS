create or replace function private.payment_checkout_execute(p_token uuid,p_shop uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a public.appointments%rowtype; s public.barbershops%rowtype; o public.appointment_product_orders%rowtype; pl public.plans%rowtype;
 r private.payment_checkout_runs%rowtype; ev private.payment_checkout_events%rowtype;
 shop uuid; k uuid; kind text; scenario_value text; period date; gross bigint; settled bigint; due bigint; d bigint; service_due bigint; product_due bigint; subscription_due bigint;
 next_status text; next_outcome text; current_run uuid; result jsonb;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023'; end if;
 if p_token is not null and p_shop is null then
  select * into a from public.appointments where manage_token=p_token and manage_token_expires_at>now();
  if not found then raise exception 'SIM_NOT_FOUND' using errcode='P0002'; end if;
  shop:=a.barbershop_id;
 elsif p_token is null and p_shop is not null then
  if not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then perform private.require_platform_admin(); end if; shop:=p_shop;
 else raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023'; end if;
 if not private.payment_checkout_allowed(shop) then
  if p_action='list' then return jsonb_build_object('enabled',false,'quotes','[]'::jsonb,'runs','[]'::jsonb); end if;
  raise exception 'SIM_DISABLED' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-checkout:'||shop::text,0));
 if p_token is not null then
  -- Respect the booking engine's barber-level serialization before row locking.
  perform pg_advisory_xact_lock(hashtextextended('barber-booking:'||a.barber_id::text,0));
  select * into a from public.appointments where id=a.id and manage_token=p_token and manage_token_expires_at>now() for update;
  if not found then raise exception 'SIM_NOT_FOUND' using errcode='P0002'; end if;
  select * into o from public.appointment_product_orders where appointment_id=a.id and barbershop_id=shop for update;
 end if;
 select * into s from public.barbershops where id=shop and status in ('active','trial');
 if not found then raise exception 'SIM_DISABLED' using errcode='42501'; end if;
 period:=date_trunc('month',now() at time zone 'Africa/Maputo')::date;
 if p_token is null then
  select * into pl from public.plans where id=s.plan_id and is_active;
  subscription_due:=coalesce(pl.price_cents,0);
  if exists(select 1 from private.payment_checkout_runs x where x.shop_id=shop and x.purpose='subscription' and x.billing_period=period and x.status='paid' and x.outcome<>'LATE_SUCCESS') then subscription_due:=0; end if;
 else
  d:=case when a.status='pending' and a.deposit_status='awaiting' and a.hold_expires_at>now() then a.deposit_cents else 0 end;
  select coalesce(sum(x.amount_minor),0) into settled from private.payment_checkout_runs x where x.appointment_id=a.id and x.purpose='service' and x.status='paid' and x.outcome<>'LATE_SUCCESS';
  service_due:=case when a.status='completed' then greatest(0,a.price_cents-case when a.deposit_status='paid' then a.deposit_cents else 0 end-settled) else 0 end;
  select coalesce(sum(i.unit_price_snapshot*i.delivered_qty),0) into gross from public.appointment_product_order_items i where i.order_id=o.id and i.barbershop_id=shop;
  select coalesce(sum(x.amount_minor),0) into settled from private.payment_checkout_runs x where x.order_id=o.id and x.status='paid' and x.outcome<>'LATE_SUCCESS';
  product_due:=case when o.status::text in ('delivered','partially_delivered') then greatest(0,gross-settled-(select coalesce(sum(p.amount_minor),0) from public.shop_order_payments p where p.order_id=o.id and p.barbershop_id=shop)) else 0 end;
 end if;
 if p_action='list' then
  return jsonb_build_object('enabled',true,'quotes',case when p_token is null then jsonb_build_array(jsonb_build_object('purpose','subscription','amount_minor',subscription_due,'label',coalesce(pl.name,'Sem plano activo'),'period',period))
   else jsonb_build_array(jsonb_build_object('purpose','deposit','amount_minor',d,'label','Sinal da marcação'),jsonb_build_object('purpose','service','amount_minor',service_due,'label','Serviço concluído'),jsonb_build_object('purpose','product','amount_minor',product_due,'label','Artigos entregues')) end,
   'runs',coalesce((select jsonb_agg(private.payment_checkout_snapshot(x.id) order by x.created_at desc) from
    (select id,created_at from private.payment_checkout_runs where shop_id=shop and ((p_token is not null and appointment_id=a.id) or (p_token is null and purpose='subscription')) order by created_at desc limit 25) x),'[]'::jsonb));
 end if;
 if p_action is null or p_action not in ('create','confirm','reconcile','refund','replay') then raise exception 'SIM_INVALID_ACTION' using errcode='22023'; end if;
 k:=(p_payload->>'request_id')::uuid;
 if k is null then raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023'; end if;
 if p_action='create' then
  kind:=p_payload->>'purpose'; scenario_value:=p_payload->>'scenario';
  if kind is null or scenario_value is null or scenario_value not in ('success','insufficient_funds','cancelled','invalid_number','pending','timeout','duplicate_callback','late_success','provider_error')
    or (p_token is null and kind<>'subscription') or (p_token is not null and kind not in ('deposit','service','product')) then raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023'; end if;
  select * into r from private.payment_checkout_runs where shop_id=shop and request_id=k;
  if found then
   if r.purpose<>kind or r.scenario<>scenario_value or r.appointment_id is distinct from a.id then raise exception 'SIM_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
   return private.payment_checkout_snapshot(r.id);
  end if;
  due:=case kind when 'deposit' then d when 'service' then service_due when 'product' then product_due else subscription_due end;
  if coalesce(due,0)<1 then raise exception 'SIM_NOT_DUE' using errcode='22023'; end if;
  if exists(select 1 from private.payment_checkout_runs x where x.shop_id=shop and x.purpose=kind and x.status='pending' and ((p_token is not null and x.appointment_id=a.id) or (p_token is null and x.billing_period=period))) then raise exception 'SIM_PENDING_EXISTS' using errcode='22023'; end if;
  if (select count(*) from private.payment_checkout_runs x where x.shop_id=shop and x.created_at>now()-interval '1 minute')>=30 then raise exception 'SIM_RATE_LIMIT'; end if;
  insert into private.payment_checkout_runs(shop_id,appointment_id,order_id,plan_id,billing_period,purpose,request_id,amount_minor,scenario)
   values(shop,a.id,case when kind='product' then o.id end,case when kind='subscription' then pl.id end,case when kind='subscription' then period end,kind,k,due,scenario_value) returning * into r;
  insert into private.payment_checkout_events(run_id,request_id,action,status,outcome) values(r.id,k,'create','pending','REQUESTED');
  return private.payment_checkout_snapshot(r.id);
 end if;
 current_run:=(p_payload->>'run_id')::uuid;
 select * into r from private.payment_checkout_runs x where x.id=current_run and x.shop_id=shop and ((p_token is not null and x.appointment_id=a.id) or (p_token is null and x.purpose='subscription')) for update;
 if not found then raise exception 'SIM_NOT_FOUND' using errcode='P0002'; end if;
 select * into ev from private.payment_checkout_events where run_id=r.id and request_id=k;
 if found then
  if ev.action<>p_action then raise exception 'SIM_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
  return private.payment_checkout_snapshot(r.id);
 end if;
 if (select count(*) from private.payment_checkout_events where run_id=r.id)>=98 then raise exception 'SIM_EVENT_LIMIT'; end if;
 next_status:=r.status; next_outcome:=r.outcome;
 if p_action='replay' then
  if r.status='pending' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
 elsif p_action='refund' then
  if r.status<>'paid' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
  if r.purpose='deposit' and r.outcome<>'LATE_SUCCESS' then
   if a.status<>'confirmed' or a.deposit_status<>'paid' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
   update public.appointments set status='cancelled',deposit_status='refunded',cancelled_at=now(),cancel_reason='Reembolso de teste QA' where id=a.id;
  end if;
  next_status:='refunded'; next_outcome:='REFUNDED';
 else
  if r.status<>'pending' or (p_action='confirm' and r.outcome<>'REQUESTED') or
   (p_action='reconcile' and r.outcome not in ('PENDING','TIMEOUT','PROVIDER_ERROR')) then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
  case r.scenario
   when 'insufficient_funds' then next_status:='failed';next_outcome:='INSUFFICIENT_FUNDS';
   when 'cancelled' then next_status:='failed';next_outcome:='CANCELLED';
   when 'invalid_number' then next_status:='failed';next_outcome:='INVALID_NUMBER';
   when 'pending' then if p_action='confirm' then next_outcome:='PENDING';else next_status:='paid';next_outcome:='RECONCILED';end if;
   when 'timeout' then if p_action='confirm' then next_outcome:='TIMEOUT';else next_status:='paid';next_outcome:='RECONCILED';end if;
   when 'provider_error' then if p_action='confirm' then next_outcome:='PROVIDER_ERROR';else next_status:='failed';next_outcome:='PROVIDER_REJECTED';end if;
   else next_status:='paid';next_outcome:='CONFIRMED';
  end case;
  if next_status='paid' then
   due:=case r.purpose when 'deposit' then d when 'service' then service_due when 'product' then product_due else subscription_due end;
   if r.scenario='late_success' or coalesce(due,0)<r.amount_minor or (r.purpose='subscription' and (r.billing_period<>period or r.plan_id is distinct from pl.id)) then next_outcome:='LATE_SUCCESS';
   elsif r.purpose='deposit' then
    update public.appointments set status='confirmed',deposit_status='paid',confirmed_at=now(),hold_expires_at=null where id=a.id;
   end if;
  end if;
 end if;
 if p_action<>'replay' then update private.payment_checkout_runs set status=next_status,outcome=next_outcome,updated_at=clock_timestamp() where id=r.id; end if;
 insert into private.payment_checkout_events(run_id,request_id,action,status,outcome) values(r.id,k,p_action,next_status,case when p_action='replay' then 'DUPLICATE_IGNORED' else next_outcome end);
 if r.scenario='duplicate_callback' and p_action='confirm' then insert into private.payment_checkout_events(run_id,request_id,action,status,outcome) values(r.id,gen_random_uuid(),'replay',next_status,'DUPLICATE_IGNORED'); end if;
 return private.payment_checkout_snapshot(r.id);
end $$;

create function public.payment_checkout_staff(p_shop uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then perform private.require_platform_admin(); end if;
 if not private.payment_checkout_allowed(p_shop) then return jsonb_build_object('enabled',false,'runs','[]'::jsonb); end if;
 return jsonb_build_object('enabled',true,'runs',coalesce((select jsonb_agg(private.payment_checkout_snapshot(x.id) || jsonb_build_object('appointment_id',x.appointment_id,'order_id',x.order_id,'billing_period',x.billing_period) order by x.created_at desc)
 from (select id,appointment_id,order_id,billing_period,created_at from private.payment_checkout_runs where shop_id=p_shop order by created_at desc limit 50) x),'[]'::jsonb));
end $$;
revoke all on function public.payment_checkout_staff(uuid) from public,anon,authenticated,service_role;
grant execute on function public.payment_checkout_staff(uuid) to authenticated;
notify pgrst,'reload schema';
