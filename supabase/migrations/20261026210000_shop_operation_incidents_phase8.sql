-- BarberOS | Fase 8 | incident management and operational support.
-- Forward-only. No tenant is enabled by this migration.
create table public.shop_operation_incidents (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 order_id uuid,
 incident_type text not null check (incident_type in ('complaint','stock','order','payment','notification','privacy','other')),
 severity text not null check (severity in ('low','medium','high','critical')),
 status text not null default 'open' check (status in ('open','investigating','resolved','dismissed')),
 summary text not null check (length(btrim(summary)) between 5 and 180),
 details text not null check (length(btrim(details)) between 10 and 3000),
 opened_by uuid references auth.users(id) on delete set null,
 assigned_to uuid references auth.users(id) on delete set null,
 resolved_by uuid references auth.users(id) on delete set null,
 resolution_note text check (resolution_note is null or length(btrim(resolution_note)) between 10 and 1500),
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint shop_operation_incidents_id_tenant_key unique (id,barbershop_id),
 constraint shop_operation_incidents_order_tenant_fkey
   foreign key (order_id,barbershop_id) references public.appointment_product_orders(id,barbershop_id) on delete cascade,
 constraint shop_operation_incidents_terminal_state_check check (
   (status in ('resolved','dismissed') and resolved_at is not null)
   or (status in ('open','investigating') and resolved_at is null)
 )
);
create index shop_operation_incidents_queue_idx on public.shop_operation_incidents(barbershop_id,status,severity,created_at desc);
create index shop_operation_incidents_order_idx on public.shop_operation_incidents(barbershop_id,order_id) where order_id is not null;
create index shop_operation_incidents_opened_by_idx on public.shop_operation_incidents(opened_by) where opened_by is not null;
create index shop_operation_incidents_assigned_to_idx on public.shop_operation_incidents(assigned_to) where assigned_to is not null;
create index shop_operation_incidents_resolved_by_idx on public.shop_operation_incidents(resolved_by) where resolved_by is not null;

create table public.shop_operation_incident_events (
 id uuid primary key default gen_random_uuid(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 incident_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 event_type text not null check (event_type in ('opened','status_changed','assigned','resolved','dismissed')),
 previous_state jsonb,
 next_state jsonb not null default '{}'::jsonb check (jsonb_typeof(next_state)='object'),
 created_at timestamptz not null default now(),
 constraint shop_operation_incident_events_tenant_fkey
   foreign key (incident_id,barbershop_id) references public.shop_operation_incidents(id,barbershop_id) on delete cascade
);
create index shop_operation_incident_events_history_idx on public.shop_operation_incident_events(barbershop_id,incident_id,created_at);

alter table public.shop_operation_incidents enable row level security;
alter table public.shop_operation_incident_events enable row level security;
revoke all on public.shop_operation_incidents,public.shop_operation_incident_events from public,anon,authenticated;
grant select on public.shop_operation_incidents,public.shop_operation_incident_events to authenticated;
grant all on public.shop_operation_incidents,public.shop_operation_incident_events to service_role;
create policy shop_operation_incidents_manager_read on public.shop_operation_incidents for select to authenticated using (
 public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
);
create policy shop_operation_incident_events_manager_read on public.shop_operation_incident_events for select to authenticated using (
 public.is_member(barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
);

create or replace function public.create_shop_operation_incident(
 p_barbershop_id uuid,p_order_id uuid,p_incident_type text,p_severity text,p_summary text,p_details text
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_incident public.shop_operation_incidents%rowtype; v_event public.shop_operation_incident_events%rowtype;
begin
 if v_actor is null or not (
  public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
 ) then raise exception 'SHOP_INCIDENT_FORBIDDEN' using errcode='42501'; end if;
 if p_incident_type is null or p_incident_type not in ('complaint','stock','order','payment','notification','privacy','other')
  or p_severity is null or p_severity not in ('low','medium','high','critical')
  or p_summary is null or length(btrim(p_summary)) not between 5 and 180
  or p_details is null or length(btrim(p_details)) not between 10 and 3000 then
  raise exception 'SHOP_INCIDENT_INVALID_FIELDS';
 end if;
 if p_order_id is not null and not exists (
  select 1 from public.appointment_product_orders o where o.id=p_order_id and o.barbershop_id=p_barbershop_id
 ) then raise exception 'SHOP_INCIDENT_ORDER_TENANT_MISMATCH'; end if;
 insert into public.shop_operation_incidents(barbershop_id,order_id,incident_type,severity,status,summary,details,opened_by)
 values(p_barbershop_id,p_order_id,p_incident_type,p_severity,'open',btrim(p_summary),btrim(p_details),v_actor)
 returning * into v_incident;
 insert into public.shop_operation_incident_events(barbershop_id,incident_id,actor_id,event_type,previous_state,next_state)
 values(p_barbershop_id,v_incident.id,v_actor,'opened',null,
  jsonb_build_object('status',v_incident.status,'incident_type',v_incident.incident_type,'severity',v_incident.severity,'summary',v_incident.summary))
 returning * into v_event;
 return to_jsonb(v_incident)||jsonb_build_object('events',jsonb_build_array(to_jsonb(v_event)));
end;
$function$;

create or replace function public.update_shop_operation_incident(
 p_barbershop_id uuid,p_incident_id uuid,p_status text,p_assigned_to uuid default null,p_resolution_note text default null
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid:=auth.uid(); v_incident public.shop_operation_incidents%rowtype;
 v_updated public.shop_operation_incidents%rowtype; v_event public.shop_operation_incident_events%rowtype;
 v_event_type text; v_resolution_note text:=nullif(btrim(p_resolution_note),'');
begin
 if v_actor is null or not (
  public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
 ) then raise exception 'SHOP_INCIDENT_FORBIDDEN' using errcode='42501'; end if;
 if p_status is null or p_status not in ('open','investigating','resolved','dismissed') then raise exception 'SHOP_INCIDENT_INVALID_STATUS'; end if;
 select * into v_incident from public.shop_operation_incidents i where i.id=p_incident_id and i.barbershop_id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_INCIDENT_NOT_FOUND' using errcode='P0002'; end if;
 if v_incident.status in ('resolved','dismissed') then raise exception 'SHOP_INCIDENT_TERMINAL'; end if;
 if p_assigned_to is not null and not exists (
  select 1 from public.barbershop_members m where m.barbershop_id=p_barbershop_id and m.user_id=p_assigned_to
 ) then raise exception 'SHOP_INCIDENT_ASSIGNEE_NOT_MEMBER'; end if;
 if p_status in ('resolved','dismissed') and (v_resolution_note is null or length(v_resolution_note) not between 10 and 1500) then
  raise exception 'SHOP_INCIDENT_RESOLUTION_NOTE_REQUIRED';
 end if;
 if p_status not in ('resolved','dismissed') and v_resolution_note is not null and length(v_resolution_note)>1500 then
  raise exception 'SHOP_INCIDENT_RESOLUTION_NOTE_INVALID';
 end if;
 update public.shop_operation_incidents i set
  status=p_status,assigned_to=coalesce(p_assigned_to,i.assigned_to),
  resolution_note=case when p_status in ('resolved','dismissed') then v_resolution_note else i.resolution_note end,
  resolved_at=case when p_status in ('resolved','dismissed') then now() else null end,
  resolved_by=case when p_status in ('resolved','dismissed') then v_actor else null end,updated_at=now()
 where i.id=p_incident_id and i.barbershop_id=p_barbershop_id returning * into v_updated;
 v_event_type:=case when p_status='resolved' then 'resolved' when p_status='dismissed' then 'dismissed'
  when p_assigned_to is not null and v_incident.status=p_status then 'assigned' else 'status_changed' end;
 insert into public.shop_operation_incident_events(barbershop_id,incident_id,actor_id,event_type,previous_state,next_state)
 values(p_barbershop_id,v_updated.id,v_actor,v_event_type,
  jsonb_build_object('status',v_incident.status,'assigned_to',v_incident.assigned_to),
  jsonb_build_object('status',v_updated.status,'assigned_to',v_updated.assigned_to,'resolution_note',v_updated.resolution_note))
 returning * into v_event;
 return to_jsonb(v_updated)||jsonb_build_object('event',to_jsonb(v_event));
end;
$function$;

create or replace function public.list_shop_operation_incidents(p_barbershop_id uuid,p_status text default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_actor uuid:=auth.uid(); v_result jsonb; v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
begin
 if v_actor is null or not (
  public.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or public.is_platform_admin()
 ) then raise exception 'SHOP_INCIDENT_FORBIDDEN' using errcode='42501'; end if;
 if p_status is not null and p_status not in ('open','investigating','resolved','dismissed') then raise exception 'SHOP_INCIDENT_INVALID_STATUS'; end if;
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('events',coalesce((
  select jsonb_agg(to_jsonb(e) order by e.created_at) from public.shop_operation_incident_events e
  where e.barbershop_id=i.barbershop_id and e.incident_id=i.id
 ),'[]'::jsonb)) order by case i.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,i.created_at desc),'[]'::jsonb)
 into v_result from (
  select incident.* from public.shop_operation_incidents incident
  where incident.barbershop_id=p_barbershop_id and (p_status is null or incident.status=p_status)
  order by case incident.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,incident.created_at desc
  limit v_limit
 ) i;
 return v_result;
end;
$function$;

revoke all on function public.create_shop_operation_incident(uuid,uuid,text,text,text,text) from public,anon;
revoke all on function public.update_shop_operation_incident(uuid,uuid,text,uuid,text) from public,anon;
revoke all on function public.list_shop_operation_incidents(uuid,text,integer) from public,anon;
grant execute on function public.create_shop_operation_incident(uuid,uuid,text,text,text,text) to authenticated;
grant execute on function public.update_shop_operation_incident(uuid,uuid,text,uuid,text) to authenticated;
grant execute on function public.list_shop_operation_incidents(uuid,text,integer) to authenticated;
