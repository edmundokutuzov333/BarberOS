-- BarberOS Phase 17: reviews acceptance suite.
-- Every domain mutation is rollback-only. No fixture survives this test.

begin;

do $block$
declare
  v_err text;
  v_owner uuid;
begin
  if not has_function_privilege('anon','public.get_review_by_token(uuid)','execute') then
    raise exception 'FAIL: anon review view grant missing';
  end if;
  if not has_function_privilege('authenticated','public.get_review_by_token(uuid)','execute') then
    raise exception 'FAIL: authenticated review view grant missing';
  end if;
  if not has_function_privilege('anon','public.submit_review_by_token(uuid,integer,text)','execute') then
    raise exception 'FAIL: anon review submit grant missing';
  end if;
  if not has_function_privilege('authenticated','public.submit_review_by_token(uuid,integer,text)','execute') then
    raise exception 'FAIL: authenticated review submit grant missing';
  end if;
  if not has_function_privilege('authenticated','public.get_reviews(uuid,uuid,integer,text,integer,integer)','execute') then
    raise exception 'FAIL: authenticated review list grant missing';
  end if;
  if not has_function_privilege('authenticated','public.set_review_publication(uuid,uuid,boolean)','execute') then
    raise exception 'FAIL: authenticated moderation grant missing';
  end if;
  if has_function_privilege('anon','public.get_reviews(uuid,uuid,integer,text,integer,integer)','execute') then
    raise exception 'FAIL: anon review list must remain operator-only';
  end if;
  if has_function_privilege('anon','public.set_review_publication(uuid,uuid,boolean)','execute') then
    raise exception 'FAIL: anon moderation grant must be blocked';
  end if;

  if has_table_privilege('anon','public.reviews','INSERT')
     or has_table_privilege('anon','public.reviews','UPDATE')
     or has_table_privilege('anon','public.reviews','DELETE') then
    raise exception 'FAIL: anon direct review DML is exposed';
  end if;

  if has_table_privilege('authenticated','public.reviews','INSERT')
     or has_table_privilege('authenticated','public.reviews','UPDATE')
     or has_table_privilege('authenticated','public.reviews','DELETE') then
    raise exception 'FAIL: authenticated direct review DML is exposed';
  end if;

  select m.user_id
    into v_owner
  from public.barbershop_members m
  where m.role='owner'
  order by m.created_at
  limit 1;

  if v_owner is null then
    raise exception 'FAIL: owner fixture unavailable';
  end if;
end
$block$;

do $block$
declare
  v_appt public.appointments%rowtype;
  v_barber_before public.barbers%rowtype;
  v_before_notifications int;
  v_before_reviews int;
  v_view jsonb;
  v_view_row record;
  v_result record;
  v_again record;
  v_err text;
  v_owner uuid;
  v_hidden record;
  v_published record;
begin
  select a.*
    into v_appt
  from public.appointments a
  where not exists(select 1 from public.reviews r where r.appointment_id=a.id)
  order by a.created_at desc
  limit 1;

  if v_appt.id is null then
    raise exception 'FAIL: no appointment fixture without a review';
  end if;

  select b.* into v_barber_before
  from public.barbers b
  where b.id=v_appt.barber_id;

  select count(*)::int into v_before_notifications
  from public.notifications
  where appointment_id=v_appt.id;

  select count(*)::int into v_before_reviews
  from public.reviews;

  update public.appointments
  set status='completed',
      completed_at=now()-interval '30 minutes',
      deposit_status=(case when deposit_cents>0 then 'paid' else 'not_required' end)::public.deposit_state,
      hold_expires_at=null
  where id=v_appt.id;

  select to_jsonb(x) into v_view
  from public.get_review_by_token(v_appt.manage_token) x
  limit 1;

  if v_view ? 'appointment_id'
     or v_view ? 'customer_id'
     or v_view ? 'barbershop_id'
     or v_view ? 'review_id'
     or v_view ? 'id' then
    raise exception 'FAIL: public review view leaks internal identifier';
  end if;

  select * into v_view_row from public.get_review_by_token(v_appt.manage_token);
  if v_view_row.appointment_status <> 'completed'
     or v_view_row.has_review
     or v_view_row.can_submit
     or v_view_row.available_at is null
     or v_view_row.available_at <= now() then
    raise exception 'FAIL: one-hour review gate not enforced';
  end if;

  begin
    perform public.submit_review_by_token(v_appt.manage_token,5,'Demasiado cedo');
    raise exception 'FAIL: review was accepted before the one-hour gate';
  exception when others then
    get stacked diagnostics v_err=message_text;
    if v_err <> 'REVIEW_NOT_AVAILABLE_YET' then raise; end if;
  end;

  select count(*)::int into v_before_notifications
  from public.notifications
  where appointment_id=v_appt.id
    and template_key='review_request';

  if v_before_notifications<>1 then
    raise exception 'FAIL: completed appointment must queue exactly one review request';
  end if;

  update public.appointments
  set completed_at=now()-interval '2 hours'
  where id=v_appt.id;

  select * into v_view_row from public.get_review_by_token(v_appt.manage_token);
  if not v_view_row.can_submit then
    raise exception 'FAIL: review should become available after one hour';
  end if;

  begin
    perform public.submit_review_by_token(v_appt.manage_token,0,null);
    raise exception 'FAIL: rating 0 accepted';
  exception when others then
    get stacked diagnostics v_err=message_text;
    if v_err <> 'REVIEW_RATING_INVALID' then raise; end if;
  end;

  select review_id,rating,comment,created_at
    into v_result
  from public.submit_review_by_token(
    v_appt.manage_token,
    5,
    'Atendimento excelente e pontual.'
  );

  if v_result.review_id is null or v_result.rating<>5 or v_result.comment<>'Atendimento excelente e pontual.' then
    raise exception 'FAIL: review submission result contract failed';
  end if;

  select review_id,rating,comment,created_at
    into v_again
  from public.submit_review_by_token(
    v_appt.manage_token,
    1,
    'Tentativa repetida'
  );

  if v_again.review_id<>v_result.review_id
     or v_again.rating<>5
     or v_again.comment<>'Atendimento excelente e pontual.' then
    raise exception 'FAIL: repeat submission was not idempotent';
  end if;

  select m.user_id
    into v_owner
  from public.barbershop_members m
  where m.barbershop_id=v_appt.barbershop_id
    and m.role='owner'
  order by m.created_at
  limit 1;

  if v_owner is null then
    raise exception 'FAIL: owner fixture unavailable for moderation';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);

  select * into v_view_row from public.get_review_by_token(v_appt.manage_token);
  if not v_view_row.has_review
     or v_view_row.can_submit
     or v_view_row.rating<>5
     or v_view_row.comment<>'Atendimento excelente e pontual.' then
    raise exception 'FAIL: submitted review state not readable through public token boundary';
  end if;

  select count(*)::int into v_before_notifications
  from public.notifications
  where appointment_id=v_appt.id
    and template_key='review_request';

  if v_before_notifications<>1 then
    raise exception 'FAIL: review request was duplicated';
  end if;

  select review_id,is_published,rating_avg,rating_count
    into v_hidden
  from public.set_review_publication(
    v_appt.barbershop_id,
    v_result.review_id,
    false
  );

  if v_hidden.is_published
     or v_hidden.rating_count<>v_barber_before.rating_count
     or v_hidden.rating_avg<>v_barber_before.rating_avg then
    raise exception 'FAIL: hiding review did not recalculate barber rating';
  end if;

  select review_id,is_published,rating_avg,rating_count
    into v_published
  from public.set_review_publication(
    v_appt.barbershop_id,
    v_result.review_id,
    true
  );

  if not v_published.is_published
     or v_published.rating_count<>v_barber_before.rating_count+1
     or round(v_published.rating_avg,2)<>round(((v_barber_before.rating_avg*v_barber_before.rating_count+5)/(v_barber_before.rating_count+1))::numeric,2) then
    raise exception 'FAIL: publishing review did not recalculate barber rating';
  end if;

  if not exists(
    select 1
    from public.audit_logs
    where entity='review'
      and entity_id=v_result.review_id
      and action='review_submitted'
  ) then
    raise exception 'FAIL: review submission audit missing';
  end if;

  if not exists(
    select 1
    from public.audit_logs
    where entity='review'
      and entity_id=v_result.review_id
      and action='review_publication_changed'
  ) then
    raise exception 'FAIL: review moderation audit missing';
  end if;

  perform public.get_reviews(
    v_appt.barbershop_id,
    v_appt.barber_id,
    5,
    'published',
    20,
    0
  );

  perform public.get_review_by_token(v_appt.manage_token);

  if not exists(
    select 1 from public.reviews
    where appointment_id=v_appt.id
      and barbershop_id=v_appt.barbershop_id
      and barber_id=v_appt.barber_id
      and rating=5
      and is_published
  ) then
    raise exception 'FAIL: persisted review domain relation invalid';
  end if;

  begin
    perform public.get_reviews(v_appt.barbershop_id,null,null,'INVALID',20,0);
    raise exception 'FAIL: invalid review publication filter accepted';
  exception when others then
    get stacked diagnostics v_err=message_text;
    if v_err <> 'REVIEW_PUBLICATION_FILTER_INVALID' then raise; end if;
  end;
end
$block$;

rollback;

select
  has_function_privilege('anon','public.get_review_by_token(uuid)','execute') as anon_review_view,
  has_function_privilege('anon','public.submit_review_by_token(uuid,integer,text)','execute') as anon_review_submit,
  not has_function_privilege('anon','public.get_reviews(uuid,uuid,integer,text,integer,integer)','execute') as anon_no_operator_list,
  not has_function_privilege('anon','public.set_review_publication(uuid,uuid,boolean)','execute') as anon_no_moderation,
  not has_table_privilege('anon','public.reviews','INSERT') as anon_no_direct_insert,
  not has_table_privilege('authenticated','public.reviews','UPDATE') as auth_no_direct_update,
  exists(select 1 from pg_indexes where schemaname='public' and indexname='notifications_review_request_unique') as review_notification_dedupe_index,
  exists(select 1 from pg_trigger where tgname='sync_barber_rating_from_review') as rating_trigger_present;
