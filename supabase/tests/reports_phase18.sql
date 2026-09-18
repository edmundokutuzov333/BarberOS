-- BarberOS Phase 18: reporting acceptance suite.
-- Existing production fixtures are mutated only inside rollback.

begin;

do $block$
declare
  v_shop uuid;
  v_owner uuid;
  v_appt public.appointments%rowtype;
  v_barber uuid;
  v_service record;
  v_haircut record;
  v_barber_row record;
  v_summary_before record;
  v_summary_completed record;
  v_summary_cancelled record;
  v_day date;
  v_tz text;
  v_err text;
begin
  select m.barbershop_id,m.user_id
    into v_shop,v_owner
  from public.barbershop_members m
  where m.role='owner'
  order by m.created_at
  limit 1;

  if v_shop is null or v_owner is null then
    raise exception 'FAIL: owner fixture unavailable';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);

  select s.timezone into v_tz
  from public.barbershops s
  where s.id=v_shop;

  select a.*
    into v_appt
  from public.appointments a
  where a.barbershop_id=v_shop
  order by a.starts_at,a.id
  limit 1;

  if v_appt.id is null then
    raise exception 'FAIL: appointment fixture unavailable';
  end if;

  v_day := (v_appt.starts_at at time zone v_tz)::date;

  select * into v_summary_before
  from public.get_report_summary(v_shop,v_day,v_day,null);

  update public.appointments
  set status='completed',
      completed_at=coalesce(completed_at,now())
  where id=v_appt.id;

  select * into v_summary_completed
  from public.get_report_summary(v_shop,v_day,v_day,null);

  if v_summary_completed.completed_count < v_summary_before.completed_count + 1
     or v_summary_completed.estimated_revenue_cents < v_summary_before.estimated_revenue_cents + v_appt.price_cents
     or v_summary_completed.appointment_count <> v_summary_before.appointment_count then
    raise exception 'FAIL: completed revenue/count contract';
  end if;

  select * into v_service
  from public.get_report_services(v_shop,v_day,v_day,null)
  where service_id=v_appt.service_id;

  if v_service.service_id is null
     or v_service.completed_count < 1
     or v_service.estimated_revenue_cents < v_appt.price_cents then
    raise exception 'FAIL: service report contract';
  end if;

  if v_appt.haircut_id is not null then
    select * into v_haircut
    from public.get_report_haircuts(v_shop,v_day,v_day,null)
    where haircut_id=v_appt.haircut_id;
    if v_haircut.haircut_id is null or v_haircut.completed_count < 1 then
      raise exception 'FAIL: haircut report contract';
    end if;
  end if;

  select * into v_barber_row
  from public.get_report_barbers(v_shop,v_day,v_day,null)
  where barber_id=v_appt.barber_id;

  if v_barber_row.barber_id is null
     or v_barber_row.completed_count < 1
     or v_barber_row.estimated_revenue_cents < v_appt.price_cents then
    raise exception 'FAIL: barber report contract';
  end if;

  update public.appointments
  set status='cancelled'
  where id=v_appt.id;

  select * into v_summary_cancelled
  from public.get_report_summary(v_shop,v_day,v_day,null);

  if v_summary_cancelled.cancelled_count < v_summary_before.cancelled_count + 1
     or v_summary_cancelled.booked_minutes >= v_summary_completed.booked_minutes then
    raise exception 'FAIL: cancelled appointment still occupies report capacity';
  end if;

  begin
    perform public.get_report_summary(
      v_shop,current_date-400,current_date,null
    );
    raise exception 'FAIL: report range guard accepted >366 days';
  exception when others then
    get stacked diagnostics v_err=message_text;
    if v_err<>'REPORT_RANGE_TOO_LARGE' then raise; end if;
  end;

  begin
    perform public.get_report_summary(v_shop,current_date,current_date-1,null);
    raise exception 'FAIL: inverted report range accepted';
  exception when others then
    get stacked diagnostics v_err=message_text;
    if v_err<>'INVALID_DATE_RANGE' then raise; end if;
  end;

  raise notice 'PASS | Phase 18 reporting acceptance';
end
$block$;

select
  has_function_privilege('authenticated','public.get_report_summary(uuid,date,date,uuid)','execute') as summary_auth,
  has_function_privilege('authenticated','public.get_report_daily(uuid,date,date,uuid)','execute') as daily_auth,
  has_function_privilege('authenticated','public.get_report_services(uuid,date,date,uuid)','execute') as services_auth,
  has_function_privilege('authenticated','public.get_report_haircuts(uuid,date,date,uuid)','execute') as haircuts_auth,
  has_function_privilege('authenticated','public.get_report_barbers(uuid,date,date,uuid)','execute') as barbers_auth,
  not has_function_privilege('anon','public.get_report_summary(uuid,date,date,uuid)','execute') as anon_no_summary,
  not has_function_privilege('anon','public.get_report_daily(uuid,date,date,uuid)','execute') as anon_no_daily,
  not has_function_privilege('anon','public.get_report_services(uuid,date,date,uuid)','execute') as anon_no_services,
  not has_function_privilege('anon','public.get_report_haircuts(uuid,date,date,uuid)','execute') as anon_no_haircuts,
  not has_function_privilege('anon','public.get_report_barbers(uuid,date,date,uuid)','execute') as anon_no_barbers;

rollback;
