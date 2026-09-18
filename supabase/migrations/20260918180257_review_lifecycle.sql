-- BarberOS Phase 17: review lifecycle, public token boundary, rating aggregation and moderation.
-- Reviews are created only through token-scoped RPCs. Direct client writes remain blocked.

create unique index if not exists notifications_review_request_unique
  on public.notifications (appointment_id, template_key)
  where appointment_id is not null and template_key = 'review_request';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.reviews'::regclass
      and conname='reviews_comment_length'
  ) then
    alter table public.reviews
      add constraint reviews_comment_length
      check (comment is null or length(comment) <= 2000);
  end if;
end $$;

create or replace function private.refresh_barber_rating(p_barber_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
  v_avg numeric(3,2);
begin
  if p_barber_id is null then
    return;
  end if;

  perform 1
  from public.barbers
  where id=p_barber_id
  for update;

  if not found then
    return;
  end if;

  select
    count(*)::integer,
    coalesce(round(avg(r.rating)::numeric,2),0)
  into v_count,v_avg
  from public.reviews r
  where r.barber_id=p_barber_id
    and r.is_published;

  update public.barbers
  set rating_avg=v_avg,
      rating_count=v_count
  where id=p_barber_id;
end;
$$;

revoke all on function private.refresh_barber_rating(uuid) from public,anon,authenticated;

create or replace function private.sync_barber_rating_from_review()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_barber uuid;
  v_new_barber uuid;
begin
  if tg_op in ('INSERT','UPDATE') and new.barber_id is null then
    select a.barber_id
      into new.barber_id
    from public.appointments a
    where a.id=new.appointment_id;
  end if;

  v_old_barber := case when tg_op in ('UPDATE','DELETE') then old.barber_id end;
  v_new_barber := case when tg_op in ('INSERT','UPDATE') then new.barber_id end;

  if v_old_barber is not null then
    perform private.refresh_barber_rating(v_old_barber);
  end if;

  if v_new_barber is not null then
    perform private.refresh_barber_rating(v_new_barber);
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.sync_barber_rating_from_review() from public,anon,authenticated;

drop trigger if exists sync_barber_rating_from_review on public.reviews;
create trigger sync_barber_rating_from_review
after insert or update of barber_id, rating, is_published or delete on public.reviews
for each row execute function private.sync_barber_rating_from_review();

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
  review_id uuid,
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
    r.id,
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
    returning id,rating,comment,created_at
    into v_review_id,p_rating,v_comment,v_created_at;
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

create or replace function public.get_reviews(
  p_shop uuid,
  p_barber_id uuid default null,
  p_rating integer default null,
  p_published text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  review_id uuid,
  appointment_id uuid,
  customer_name text,
  barber_id uuid,
  barber_name text,
  rating integer,
  comment text,
  is_published boolean,
  appointment_starts_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_barber_id uuid;
  v_is_barber boolean;
  v_published text := lower(btrim(coalesce(p_published,'all')));
begin
  perform private.require_agenda_access(p_shop);

  if v_published not in ('all','published','hidden') then
    raise exception 'REVIEW_PUBLICATION_FILTER_INVALID';
  end if;

  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'REVIEW_RATING_INVALID';
  end if;

  v_is_barber := private.is_member(
    p_shop,
    array['barber']::public.app_role[]
  );

  if v_is_barber then
    v_barber_id := private.my_barber_id(p_shop);
    if v_barber_id is null then
      raise exception 'BARBER_PROFILE_REQUIRED';
    end if;
  end if;

  if p_barber_id is not null and not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=p_shop
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  return query
  select
    r.id,
    r.appointment_id,
    c.name,
    r.barber_id,
    b.display_name,
    r.rating,
    r.comment,
    r.is_published,
    a.starts_at,
    r.created_at,
    count(*) over()::bigint
  from public.reviews r
  join public.appointments a on a.id=r.appointment_id
  join public.customers c on c.id=a.customer_id
  left join public.barbers b on b.id=r.barber_id
  where r.barbershop_id=p_shop
    and (p_barber_id is null or r.barber_id=p_barber_id)
    and (not v_is_barber or r.barber_id=v_barber_id)
    and (
      v_published='all'
      or (v_published='published' and r.is_published)
      or (v_published='hidden' and not r.is_published)
    )
    and (p_rating is null or r.rating=p_rating)
  order by r.created_at desc,r.id desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.get_reviews(uuid,uuid,integer,text,integer,integer) from public,anon,authenticated;
grant execute on function public.get_reviews(uuid,uuid,integer,text,integer,integer) to authenticated;

create or replace function public.set_review_publication(
  p_shop uuid,
  p_review uuid,
  p_is_published boolean
)
returns table(
  review_id uuid,
  is_published boolean,
  rating_avg numeric,
  rating_count integer
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_barber_id uuid;
  v_old boolean;
begin
  perform private.require_shop_operator(p_shop);

  if not private.is_member(
    p_shop,
    array['owner','manager']::public.app_role[]
  ) then
    raise exception 'SHOP_OPERATOR_REQUIRED';
  end if;

  select r.barber_id,r.is_published
    into v_barber_id,v_old
  from public.reviews r
  where r.id=p_review
    and r.barbershop_id=p_shop
  for update;

  if not found then
    raise exception 'REVIEW_NOT_FOUND';
  end if;

  if v_old is distinct from p_is_published then
    update public.reviews
    set is_published=p_is_published
    where id=p_review
      and barbershop_id=p_shop;

    insert into public.audit_logs(
      barbershop_id,actor_id,action,entity,entity_id,diff
    )
    values (
      p_shop,auth.uid(),'review_publication_changed','review',p_review,
      jsonb_build_object(
        'from',v_old,
        'to',p_is_published
      )
    );
  end if;

  return query
  select r.id,r.is_published,b.rating_avg,b.rating_count
  from public.reviews r
  left join public.barbers b on b.id=r.barber_id
  where r.id=p_review;
end;
$$;

revoke all on function public.set_review_publication(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_review_publication(uuid,uuid,boolean) to authenticated;

comment on function public.get_review_by_token(uuid)
is 'Public token-scoped review read boundary. Exposes no customer contact data or internal identifiers beyond the review id for the submitted-review state.';

comment on function public.submit_review_by_token(uuid,integer,text)
is 'Public token-scoped review submission. Only completed appointments one hour after completion can be reviewed; repeat submissions are idempotent.';

comment on function public.get_reviews(uuid,uuid,integer,text,integer,integer)
is 'Tenant-scoped review operations read model. Barbers only see their own reviews; owner and manager see the tenant.';

comment on function public.set_review_publication(uuid,uuid,boolean)
is 'Owner/manager-only review moderation boundary. Published reviews drive barber rating aggregates.';

