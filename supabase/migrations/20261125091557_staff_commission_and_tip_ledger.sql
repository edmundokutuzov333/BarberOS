-- Staff earnings are an operational ledger, not payment processing or payroll settlement.
create table private.staff_commission_rates(
 barber_id uuid primary key references public.barbers(id) on delete cascade,
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 rate_bps integer not null check(rate_bps between 0 and 10000),
 updated_at timestamptz not null default now()
);
create table private.staff_earnings(
 appointment_id uuid primary key,
 barbershop_id uuid not null,
 barber_id uuid not null references public.barbers(id),
 service_minor integer not null check(service_minor>=0),
 rate_bps integer check(rate_bps between 0 and 10000),
 commission_minor integer check(commission_minor>=0 and commission_minor<=service_minor),
 tip_minor integer not null default 0 check(tip_minor between 0 and 1000000000),
 created_at timestamptz not null default now(),
 foreign key(appointment_id,barbershop_id) references public.appointments(id,barbershop_id) on delete cascade,
 check((rate_bps is null)=(commission_minor is null))
);
create index staff_earnings_shop_barber_idx on private.staff_earnings(barbershop_id,barber_id);
alter table private.staff_commission_rates enable row level security;
alter table private.staff_earnings enable row level security;
revoke all on private.staff_commission_rates,private.staff_earnings from public,anon,authenticated;
create function private.capture_staff_earnings() returns trigger language plpgsql security definer set search_path='' as $fn$
declare rate integer;
begin
 if new.status<>'completed' then return new;end if;
 if tg_op='UPDATE' and old.status='completed' then return new;end if;
 select r.rate_bps into rate from private.staff_commission_rates r where r.barber_id=new.barber_id and r.barbershop_id=new.barbershop_id;
 insert into private.staff_earnings(appointment_id,barbershop_id,barber_id,service_minor,rate_bps,commission_minor)
 values(new.id,new.barbershop_id,new.barber_id,new.price_cents,rate,round(new.price_cents::numeric*rate/10000)::integer)
 on conflict(appointment_id) do nothing;
 return new;
end $fn$;
revoke all on function private.capture_staff_earnings() from public,anon,authenticated;
create trigger capture_staff_earnings after insert or update of status on public.appointments for each row execute function private.capture_staff_earnings();
create function public.set_staff_commission_rate(p_shop uuid,p_barber uuid,p_rate_bps integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare previous integer;
begin
 if auth.uid() is null or not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then raise exception 'STAFF_EARNINGS_FORBIDDEN' using errcode='42501';end if;
 if p_rate_bps is null or p_rate_bps not between 0 and 10000 then raise exception 'STAFF_COMMISSION_INVALID';end if;
 perform 1 from public.barbers b where b.id=p_barber and b.barbershop_id=p_shop for update;
 if not found then raise exception 'BARBER_NOT_FOUND';end if;
 select rate_bps into previous from private.staff_commission_rates where barber_id=p_barber and barbershop_id=p_shop;
 insert into private.staff_commission_rates(barber_id,barbershop_id,rate_bps) values(p_barber,p_shop,p_rate_bps)
 on conflict(barber_id) do update set rate_bps=excluded.rate_bps,updated_at=now() where private.staff_commission_rates.barbershop_id=p_shop;
 if previous is distinct from p_rate_bps then
 insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'staff_commission_rate_changed','barber',p_barber,jsonb_build_object('previous_bps',previous,'new_bps',p_rate_bps));
 end if;
 return jsonb_build_object('barber_id',p_barber,'rate_bps',p_rate_bps);
end $fn$;
create function public.record_staff_tip(p_shop uuid,p_appointment uuid,p_tip_minor integer,p_expected_tip_minor integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare a public.appointments%rowtype; previous integer;
begin
 if auth.uid() is null or not private.is_member(p_shop,array['owner','manager']::public.app_role[]) then raise exception 'STAFF_EARNINGS_FORBIDDEN' using errcode='42501';end if;
 if p_tip_minor is null or p_tip_minor not between 0 and 1000000000 or p_expected_tip_minor is null or p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'STAFF_TIP_INVALID';end if;
 select * into a from public.appointments where id=p_appointment and barbershop_id=p_shop for update;
 if not found then raise exception 'APPOINTMENT_NOT_FOUND';end if;
 if a.status<>'completed' then raise exception 'STAFF_TIP_REQUIRES_COMPLETED';end if;
 -- Historical appointments lack a reliable rate snapshot; never invent it.
 insert into private.staff_earnings(appointment_id,barbershop_id,barber_id,service_minor) values(a.id,a.barbershop_id,a.barber_id,a.price_cents) on conflict(appointment_id) do nothing;
 select tip_minor into previous from private.staff_earnings where appointment_id=a.id and barbershop_id=p_shop for update;
 if previous=p_tip_minor then return jsonb_build_object('appointment_id',a.id,'tip_minor',previous);end if;
 if previous is distinct from p_expected_tip_minor then raise exception 'STAFF_TIP_CONFLICT' using errcode='40001';end if;
 update private.staff_earnings set tip_minor=p_tip_minor where appointment_id=a.id and barbershop_id=p_shop;
 insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff) values(p_shop,auth.uid(),'staff_tip_recorded','appointment',a.id,jsonb_build_object('previous_minor',previous,'new_minor',p_tip_minor,'reason',btrim(p_reason)));
 return jsonb_build_object('appointment_id',a.id,'tip_minor',p_tip_minor);
end $fn$;
create function public.get_staff_earnings(p_shop uuid,p_from date,p_to date,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare tz text; f timestamptz; t timestamptz; v_self uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'STAFF_EARNINGS_FORBIDDEN' using errcode='42501';end if;
 if private.is_member(p_shop,array['owner','manager']::public.app_role[]) then v_self:=null;
 elsif private.is_member(p_shop,array['barber']::public.app_role[]) then v_self:=private.my_barber_id(p_shop);if v_self is null then raise exception 'STAFF_EARNINGS_FORBIDDEN' using errcode='42501';end if;
 else raise exception 'STAFF_EARNINGS_FORBIDDEN' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_offset is null or p_offset<0 then raise exception 'INVALID_DATE_RANGE';end if;
 select timezone into tz from public.barbershops where id=p_shop;
 f:=p_from::timestamp at time zone tz;t:=(p_to+1)::timestamp at time zone tz;
 with completed as (
 select a.id,a.barber_id,b.display_name,a.starts_at,a.price_cents,e.rate_bps,e.commission_minor,coalesce(e.tip_minor,0) tip_minor
 from public.appointments a join public.barbers b on b.id=a.barber_id and b.barbershop_id=a.barbershop_id
 left join private.staff_earnings e on e.appointment_id=a.id and e.barbershop_id=a.barbershop_id
 where a.barbershop_id=p_shop and a.status='completed' and a.starts_at>=f and a.starts_at<t and (v_self is null or a.barber_id=v_self)
 )
 select jsonb_build_object(
 'rates',coalesce((select jsonb_agg(jsonb_build_object('barber_id',b.id,'name',b.display_name,'rate_bps',r.rate_bps) order by b.display_name,b.id) from public.barbers b left join private.staff_commission_rates r on r.barber_id=b.id and r.barbershop_id=b.barbershop_id where b.barbershop_id=p_shop and b.is_active and (v_self is null or b.id=v_self)),'[]'::jsonb),
 'total', (select count(*) from completed),
 'summary',coalesce((select jsonb_agg(to_jsonb(x) order by x.name,x.barber_id) from (select barber_id,display_name name,count(*) completed_count,count(*) filter(where commission_minor is null) unknown_count,coalesce(sum(commission_minor),0) commission_minor,coalesce(sum(tip_minor),0) tip_minor from completed group by barber_id,display_name)x),'[]'::jsonb),
 'appointments',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at desc,x.id) from (select * from completed order by starts_at desc,id limit 50 offset p_offset)x),'[]'::jsonb)
 ) into result;
 return result;
end $fn$;
revoke all on function public.set_staff_commission_rate(uuid,uuid,integer),public.record_staff_tip(uuid,uuid,integer,integer,text),public.get_staff_earnings(uuid,date,date,integer) from public,anon;
grant execute on function public.set_staff_commission_rate(uuid,uuid,integer),public.record_staff_tip(uuid,uuid,integer,integer,text),public.get_staff_earnings(uuid,date,date,integer) to authenticated;
