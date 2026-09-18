-- BarberOS Phase 17 patch: keep review public boundary free of internal review IDs and make review-request enqueue idempotent.

drop function if exists public.get_review_by_token(uuid);

create or replace function public.get_review_by_token(p_token uuid)
returns table(
  shop_name text,
  shop_slug text,
  timezone text,
  customer_name text,
  appointment_status public.appointment_status,
  appointment_completed_at timestamptz,
  service_name text,
  haircut_name text,
  barber_name text,
  barber_photo_url text,
  available_at timestamptz,
  has_review boolean,
  rating integer,
  comment text,
  review_is_published boolean,
  review_created_at timestamptz,
  can_submit boolean
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_token is null then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  return query
  select
    s.name,
    s.slug,
    s.timezone,
    c.name,
    a.status,
    a.completed_at,
    svc.name,
    h.name,
    b.display_name,
    b.photo_url,
    case
      when a.completed_at is null then null
      else a.completed_at + interval '1 hour'
    end,
    r.id is not null,
    r.rating,
    r.comment,
    r.is_published,
    r.created_at,
    (
      a.status='completed'
      and a.completed_at is not null
      and now() >= a.completed_at + interval '1 hour'
      and r.id is null
    )
  from public.appointments a
  join public.barbershops s on s.id=a.barbershop_id
  join public.customers c on c.id=a.customer_id
  join public.services svc on svc.id=a.service_id
  left join public.haircuts h on h.id=a.haircut_id
  join public.barbers b on b.id=a.barber_id
  left join public.reviews r on r.appointment_id=a.id
  where a.manage_token=p_token;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.get_review_by_token(uuid) from public,anon,authenticated;
grant execute on function public.get_review_by_token(uuid) to anon,authenticated;

create or replace function public.on_appointment_completed() returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_phone text;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    select phone into v_phone from public.customers where id=new.customer_id;
    insert into public.notifications(
      barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload
    )
    values (
      new.barbershop_id,new.id,'whatsapp','review_request',v_phone,
      new.completed_at+interval '1 hour',
      jsonb_build_object('manage_token',new.manage_token)
    )
    on conflict (appointment_id,template_key)
      where appointment_id is not null and template_key='review_request'
      do nothing;

    update public.customers
    set visits_count=visits_count+1,last_visit_at=new.completed_at
    where id=new.customer_id;
  end if;

  if new.status='no_show' and old.status is distinct from 'no_show' then
    new.no_show_at := coalesce(new.no_show_at, now());
    update public.customers
    set no_show_count=no_show_count+1
    where id=new.customer_id;
  end if;

  return new;
end;
$$;

revoke all on function public.on_appointment_completed() from public,anon,authenticated;

comment on function public.get_review_by_token(uuid)
is 'Public token-scoped review boundary without appointment, customer, barbershop or review identifiers. Returns only the customer-facing review state.';

comment on function public.on_appointment_completed()
is 'Completes the customer lifecycle update and idempotently queues the review request one hour after completion.';
