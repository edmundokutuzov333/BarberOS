-- BarberOS Phase 17 patch: remove PL/pgSQL return-column ambiguity from review submission.
create or replace function public.submit_review_by_token(
  p_token uuid,
  p_rating integer,
  p_comment text default null
)
returns table(
  review_id uuid,
  rating integer,
  comment text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_existing public.reviews%rowtype;
  v_comment text;
  v_review_id uuid;
  v_created_at timestamptz;
begin
  if p_token is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'REVIEW_RATING_INVALID';
  end if;

  v_comment := nullif(btrim(coalesce(p_comment,'')),'');
  if v_comment is not null and length(v_comment) > 2000 then
    raise exception 'REVIEW_COMMENT_TOO_LONG';
  end if;

  select a.*
    into v_appointment
  from public.appointments a
  where a.manage_token=p_token
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  if v_appointment.status <> 'completed' or v_appointment.completed_at is null then
    raise exception 'REVIEW_APPOINTMENT_NOT_COMPLETED';
  end if;

  if now() < v_appointment.completed_at + interval '1 hour' then
    raise exception 'REVIEW_NOT_AVAILABLE_YET';
  end if;

  select r.*
    into v_existing
  from public.reviews r
  where r.appointment_id=v_appointment.id;

  if found then
    return query
    select v_existing.id,v_existing.rating,v_existing.comment,v_existing.created_at;
    return;
  end if;

  begin
    insert into public.reviews(
      barbershop_id,barber_id,appointment_id,rating,comment,is_published
    )
    values (
      v_appointment.barbershop_id,v_appointment.barber_id,v_appointment.id,
      p_rating,v_comment,true
    )
    returning id,created_at
    into v_review_id,v_created_at;
  exception
    when unique_violation then
      select r.*
        into v_existing
      from public.reviews r
      where r.appointment_id=v_appointment.id;
      if found then
        return query
        select v_existing.id,v_existing.rating,v_existing.comment,v_existing.created_at;
        return;
      end if;
      raise;
  end;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values (
    v_appointment.barbershop_id,null,'review_submitted','review',v_review_id,
    jsonb_build_object(
      'appointment_id',v_appointment.id,
      'barber_id',v_appointment.barber_id,
      'rating',p_rating,
      'has_comment',v_comment is not null
    )
  );

  return query select v_review_id,p_rating,v_comment,v_created_at;
end;
$$;

revoke all on function public.submit_review_by_token(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.submit_review_by_token(uuid,integer,text) to anon,authenticated;
