-- Actual trigger, token RPCs and public payload; all fixtures roll back.
-- No dispatcher can see the queued synthetic email and no provider is called.
begin;
select set_config('barberos.review_shop',gen_random_uuid()::text,true);
select set_config('barberos.review_barber',gen_random_uuid()::text,true);
select set_config('barberos.review_service',gen_random_uuid()::text,true);
select set_config('barberos.review_customer',gen_random_uuid()::text,true);
select set_config('barberos.review_appointment',gen_random_uuid()::text,true);
select set_config('barberos.review_token',gen_random_uuid()::text,true);
insert into public.barbershops(id,slug,name,status)
values(current_setting('barberos.review_shop')::uuid,'review-'||current_setting('barberos.review_shop'),'Review fixture','trial');
insert into public.barbers(id,barbershop_id,display_name)
values(current_setting('barberos.review_barber')::uuid,current_setting('barberos.review_shop')::uuid,'Review barber');
insert into public.services(id,barbershop_id,name,price_cents,duration_min,photo_url)
values(current_setting('barberos.review_service')::uuid,current_setting('barberos.review_shop')::uuid,'Review service',10000,30,'https://example.invalid/service.jpg');
insert into public.customers(id,barbershop_id,name,phone,email)
values(current_setting('barberos.review_customer')::uuid,current_setting('barberos.review_shop')::uuid,'Review customer','+258841234567','review-fixture@example.invalid');
insert into public.appointments(id,barbershop_id,barber_id,service_id,customer_id,manage_token,starts_at,ends_at,duration_min,price_cents,status,completed_at)
values(current_setting('barberos.review_appointment')::uuid,current_setting('barberos.review_shop')::uuid,
  current_setting('barberos.review_barber')::uuid,current_setting('barberos.review_service')::uuid,
  current_setting('barberos.review_customer')::uuid,current_setting('barberos.review_token')::uuid,
  now()-interval '4 hours',now()-interval '3 hours 30 minutes',30,10000,'confirmed',now()-interval '2 hours');
update public.appointments set status='completed' where id=current_setting('barberos.review_appointment')::uuid;
update public.appointments set status='completed' where id=current_setting('barberos.review_appointment')::uuid;
do $completion$
begin
  if (select visits_count from public.customers where id=current_setting('barberos.review_customer')::uuid)<>1 then raise exception 'REVIEW_COMPLETION_VISITS_DUPLICATED'; end if;
  if (select count(*) from public.notifications where appointment_id=current_setting('barberos.review_appointment')::uuid and template_key='review_request' and channel='email' and status='queued')<>1 then raise exception 'REVIEW_EMAIL_REQUEST_MISSING_OR_DUPLICATED'; end if;
end;
$completion$;
set local role service_role;
do $review$
declare state record; first_review record; replay record;
begin
  select * into strict state from public.get_review_by_token(current_setting('barberos.review_token')::uuid);
  if state.has_review or not state.can_submit or to_jsonb(state)?'review_id' then raise exception 'REVIEW_PUBLIC_STATE_INVALID'; end if;
  select * into strict first_review from public.submit_review_by_token(current_setting('barberos.review_token')::uuid,5,'Excelente atendimento.');
  select * into strict replay from public.submit_review_by_token(current_setting('barberos.review_token')::uuid,1,'A repeated request cannot replace the original review.');
  if replay.review_id is distinct from first_review.review_id or replay.rating<>5 or replay.comment<>first_review.comment then raise exception 'REVIEW_REPLAY_NOT_IDEMPOTENT'; end if;
  select * into strict state from public.get_review_by_token(current_setting('barberos.review_token')::uuid);
  if not state.has_review or state.can_submit or state.rating<>5 then raise exception 'REVIEW_SUBMITTED_STATE_INVALID'; end if;
end;
$review$;
reset role;
do $rating$
begin
  if not exists(select 1 from public.barbers where id=current_setting('barberos.review_barber')::uuid and rating_count=1 and rating_avg=5) then raise exception 'REVIEW_RATING_AGGREGATION_FAILED'; end if;
  if (select count(*) from public.audit_logs where barbershop_id=current_setting('barberos.review_shop')::uuid and action='review_submitted')<>1 then raise exception 'REVIEW_REPLAY_AUDIT_DUPLICATED'; end if;
end;
$rating$;
set local role anon;
do $public$
declare payload jsonb;
begin
  payload:=public.get_public_barbershop('review-'||current_setting('barberos.review_shop'));
  if payload->'services'->0->>'photo_url'<>'https://example.invalid/service.jpg' or (payload->'reviews'->>'rating_count')::integer<>1 then raise exception 'PUBLIC_PHOTO_OR_REVIEW_PAYLOAD_INVALID'; end if;
  begin
    perform public.get_review_by_token(current_setting('barberos.review_token')::uuid);
    raise exception 'REVIEW_RAW_BROWSER_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end;
$public$;
reset role;
rollback;
select 'REVIEW_PUBLIC_CONTRACT_BOUNDARY_PASSED' as result;
