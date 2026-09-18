-- BarberOS Phase 10: Realtime publication acceptance.
-- This is a read-only schema/security contract test.

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public'
    and tablename='appointments';

  if v_count <> 1 then
    raise exception 'REALTIME_APPOINTMENTS_NOT_PUBLISHED';
  end if;

  select count(*) into v_count
  from pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public';

  if v_count <> 1 then
    raise exception 'REALTIME_PUBLICATION_TOO_BROAD';
  end if;

  if not exists (
    select 1
    from pg_publication
    where pubname='supabase_realtime'
      and puballtables=false
      and pubinsert=true
      and pubupdate=true
      and pubdelete=true
  ) then
    raise exception 'REALTIME_PUBLICATION_FLAGS_INVALID';
  end if;

  if (select relreplident from pg_class where oid='public.appointments'::regclass) <> 'd' then
    raise exception 'UNEXPECTED_APPOINTMENT_REPLICA_IDENTITY';
  end if;

  if not has_table_privilege('authenticated','public.appointments','SELECT') then
    raise exception 'AUTHENTICATED_APPOINTMENT_SELECT_REQUIRED_FOR_REALTIME';
  end if;

  if has_table_privilege('anon','public.appointments','SELECT') then
    raise exception 'ANON_APPOINTMENT_SELECT_MUST_REMAIN_REVOKED';
  end if;

  raise notice 'PASS | Realtime publication is limited to appointments and relies on authenticated SELECT/RLS';
end
$$;

select
  exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='appointments'
  ) as appointments_published,
  not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename in ('waitlist_entries','notifications')
  ) as future_channels_not_published,
  (select puballtables=false from pg_publication where pubname='supabase_realtime') as publication_not_global,
  (select relreplident='d' from pg_class where oid='public.appointments'::regclass) as replica_identity_default,
  has_table_privilege('authenticated','public.appointments','SELECT') as auth_can_select,
  not has_table_privilege('anon','public.appointments','SELECT') as anon_cannot_select;
