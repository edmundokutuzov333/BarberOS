-- Isolated admin-only M-Pesa laboratory. Never enables live payment gates.
create table private.payment_simulator_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.payment_simulator_settings(singleton) values(true);
alter table private.payment_simulator_settings enable row level security;
revoke all on private.payment_simulator_settings from public,anon,authenticated;

create table private.payment_simulator_runs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.barbershops(id) on delete cascade,
  request_id uuid not null,
  purpose text not null check(purpose in ('deposit','service','product','subscription')),
  amount_minor integer not null check(amount_minor between 1 and 2500000),
  scenario text not null check(scenario in ('success','insufficient_funds','cancelled','invalid_number','pending','timeout','duplicate_callback','late_success','provider_error')),
  status text not null default 'pending' check(status in ('pending','paid','failed','refunded')),
  outcome text not null default 'REQUESTED',
  simulated_entitlement text not null default 'waiting' check(simulated_entitlement in ('waiting','confirmed','rejected','refund_required','reversed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(actor_id,request_id),
  check ((status='pending' and simulated_entitlement='waiting') or
         (status='paid' and simulated_entitlement in ('confirmed','refund_required')) or
         (status='failed' and simulated_entitlement='rejected') or
         (status='refunded' and simulated_entitlement='reversed'))
);
create index payment_simulator_runs_actor_created_idx on private.payment_simulator_runs(actor_id,created_at desc,id desc);
create index payment_simulator_runs_shop_idx on private.payment_simulator_runs(shop_id);
alter table private.payment_simulator_runs enable row level security;
revoke all on private.payment_simulator_runs from public,anon,authenticated;

create table private.payment_simulator_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.payment_simulator_runs(id) on delete cascade,
  event_key uuid not null,
  event_type text not null check(event_type in ('create','confirm','reconcile','refund','replay')),
  state_before text not null check(state_before in ('none','pending','paid','failed','refunded')),
  state_after text not null check(state_after in ('pending','paid','failed','refunded')),
  outcome text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(run_id,event_key)
);
alter table private.payment_simulator_events enable row level security;
revoke all on private.payment_simulator_events from public,anon,authenticated;

create function private.payment_simulator_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'id',r.id,'shop_id',r.shop_id,'purpose',r.purpose,'amount_minor',r.amount_minor,
    'scenario',r.scenario,'status',r.status,'outcome',r.outcome,
    'entitlement',r.simulated_entitlement,'reference','SIM-'||r.id::text,
    'currency','MZN','provider','mpesa','real_money',false,
    'created_at',r.created_at,'updated_at',r.updated_at,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id::text,'type',e.event_type,
      'before',e.state_before,'after',e.state_after,'outcome',e.outcome,'created_at',e.created_at) order by e.id)
      from private.payment_simulator_events e where e.run_id=r.id),'[]'::jsonb)
  ) from private.payment_simulator_runs r where r.id=p_id;
$$;
revoke all on function private.payment_simulator_snapshot(uuid) from public,anon,authenticated;

create function public.payment_simulator(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  r private.payment_simulator_runs%rowtype;
  ev private.payment_simulator_events%rowtype;
  k uuid;
  shop uuid;
  purpose_value text;
  scenario_value text;
  amount_value integer;
  previous text;
  new_status text;
  new_outcome text;
  new_entitlement text;
begin
  perform private.require_platform_admin();
  if actor is null then raise exception 'SIM_FORBIDDEN' using errcode='42501'; end if;
  if not coalesce((select enabled from private.payment_simulator_settings where singleton),false) then
    if p_action='availability' then return jsonb_build_object('enabled',false); end if;
    raise exception 'SIM_DISABLED' using errcode='42501';
  end if;
  if p_action='availability' then return jsonb_build_object('enabled',true); end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then
    raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023';
  end if;
  if p_action='list' then
    return jsonb_build_object('shops',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id) from public.barbershops s),'[]'::jsonb),
      'runs',coalesce((select jsonb_agg(private.payment_simulator_snapshot(x.id) order by x.created_at desc,x.id desc)
        from (select id,created_at from private.payment_simulator_runs where actor_id=actor order by created_at desc,id desc limit 25) x),'[]'::jsonb));
  end if;
  if p_action is null or p_action not in ('create','confirm','reconcile','refund','replay') then raise exception 'SIM_INVALID_ACTION' using errcode='22023'; end if;
  k:=(p_payload->>'request_id')::uuid;
  if k is null then raise exception 'SIM_REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if p_action='create' then
    shop:=(p_payload->>'shop_id')::uuid;
    purpose_value:=p_payload->>'purpose';
    scenario_value:=p_payload->>'scenario';
    if jsonb_typeof(p_payload->'amount_minor') is distinct from 'number' or
       coalesce(p_payload->>'amount_minor','') !~ '^[0-9]{1,7}$' then
      raise exception 'SIM_INVALID_AMOUNT' using errcode='22023';
    end if;
    amount_value:=(p_payload->>'amount_minor')::integer;
    if shop is null or purpose_value is null or scenario_value is null or amount_value not between 1 and 2500000
      or purpose_value not in ('deposit','service','product','subscription')
      or scenario_value not in ('success','insufficient_funds','cancelled','invalid_number','pending','timeout','duplicate_callback','late_success','provider_error')
      or not exists(select 1 from public.barbershops where id=shop) then raise exception 'SIM_INVALID_PAYLOAD' using errcode='22023'; end if;
    -- Serialize a user's create operations, including idempotent retries.
    perform pg_advisory_xact_lock(hashtextextended('payment-simulator:'||actor::text,0));
    select * into r from private.payment_simulator_runs where actor_id=actor and request_id=k;
    if found then
      if r.shop_id<>shop or r.purpose<>purpose_value or r.scenario<>scenario_value or r.amount_minor<>amount_value then
        raise exception 'SIM_IDEMPOTENCY_CONFLICT' using errcode='22023';
      end if;
      return private.payment_simulator_snapshot(r.id);
    end if;
    if (select count(*) from private.payment_simulator_runs where actor_id=actor and created_at>now()-interval '1 minute')>=30 then
      raise exception 'SIM_RATE_LIMIT' using errcode='P0001';
    end if;
    insert into private.payment_simulator_runs(actor_id,shop_id,request_id,purpose,scenario,amount_minor)
      values(actor,shop,k,purpose_value,scenario_value,amount_value) returning * into r;
    insert into private.payment_simulator_events(run_id,event_key,event_type,state_before,state_after,outcome)
      values(r.id,k,'create','none','pending','REQUESTED');
    return private.payment_simulator_snapshot(r.id);
  end if;
  select * into r from private.payment_simulator_runs
    where id=(p_payload->>'run_id')::uuid and actor_id=actor for update;
  if not found then raise exception 'SIM_NOT_FOUND' using errcode='P0002'; end if;
  select * into ev from private.payment_simulator_events where run_id=r.id and event_key=k;
  if found then
    if ev.event_type<>p_action then raise exception 'SIM_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
    return private.payment_simulator_snapshot(r.id);
  end if;
  if (select count(*) from private.payment_simulator_events where run_id=r.id)>=100 then
    raise exception 'SIM_EVENT_LIMIT' using errcode='P0001';
  end if;
  previous:=r.status; new_status:=r.status; new_outcome:=r.outcome; new_entitlement:=r.simulated_entitlement;
  if p_action='refund' then
    if r.status<>'paid' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
    new_status:='refunded'; new_outcome:='REFUNDED'; new_entitlement:='reversed';
  elsif p_action='replay' then
    if r.status='pending' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
    -- An already processed provider event cannot change a terminal state.
    new_outcome:=r.outcome;
  else
    if r.status<>'pending' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
    if p_action='reconcile' and r.outcome not in ('PENDING','TIMEOUT','PROVIDER_ERROR') then
      raise exception 'SIM_INVALID_TRANSITION' using errcode='22023';
    end if;
    if p_action='confirm' and r.outcome<>'REQUESTED' then raise exception 'SIM_INVALID_TRANSITION' using errcode='22023'; end if;
    case r.scenario
      when 'insufficient_funds' then new_status:='failed';new_outcome:='INSUFFICIENT_FUNDS';
      when 'cancelled' then new_status:='failed';new_outcome:='CANCELLED';
      when 'invalid_number' then new_status:='failed';new_outcome:='INVALID_NUMBER';
      when 'pending' then if p_action='confirm' then new_outcome:='PENDING'; else new_status:='paid';new_outcome:='RECONCILED'; end if;
      when 'timeout' then if p_action='confirm' then new_outcome:='TIMEOUT'; else new_status:='paid';new_outcome:='RECONCILED'; end if;
      when 'provider_error' then if p_action='confirm' then new_outcome:='PROVIDER_ERROR'; else new_status:='failed';new_outcome:='PROVIDER_REJECTED'; end if;
      when 'late_success' then new_status:='paid';new_outcome:='LATE_SUCCESS';new_entitlement:='refund_required';
      else new_status:='paid';new_outcome:='CONFIRMED';
    end case;
    if new_status='failed' then new_entitlement:='rejected';
    elsif new_status='paid' and new_entitlement<>'refund_required' then new_entitlement:='confirmed'; end if;
  end if;
  if p_action<>'replay' then
    update private.payment_simulator_runs set status=new_status,outcome=new_outcome,
      simulated_entitlement=new_entitlement,updated_at=clock_timestamp() where id=r.id;
  end if;
  insert into private.payment_simulator_events(run_id,event_key,event_type,state_before,state_after,outcome)
    values(r.id,k,p_action,previous,new_status,case when p_action='replay' then 'DUPLICATE_IGNORED' else new_outcome end);
  if r.scenario='duplicate_callback' and p_action='confirm' then
    insert into private.payment_simulator_events(run_id,event_key,event_type,state_before,state_after,outcome)
      values(r.id,gen_random_uuid(),'replay',new_status,new_status,'DUPLICATE_IGNORED');
  end if;
  return private.payment_simulator_snapshot(r.id);
end;
$$;
revoke all on function public.payment_simulator(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.payment_simulator(text,jsonb) to authenticated;
notify pgrst,'reload schema';
