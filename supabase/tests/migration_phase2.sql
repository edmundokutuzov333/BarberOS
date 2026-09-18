-- BarberOS Phase 2 migration acceptance test.
-- Read-only. It fails if the migration contract or core baseline drifts.

do $$
declare
  migration_count integer;
  table_count integer;
  enum_count integer;
  schema_count integer;
  required_count integer;
begin
  select count(*)
    into migration_count
    from supabase_migrations.schema_migrations
   where version in (
     '20260918132000',
     '20260918132200',
     '20260918132400',
     '20260918132513'
   );

  if migration_count <> 4 then
    raise exception 'MIGRATION_BASELINE_FAIL: expected 4 recorded migrations, got %', migration_count;
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260918132000' and name='initial_schema'
  ) then
    raise exception 'MIGRATION_BASELINE_FAIL: initial_schema missing';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260918132200' and name='rls'
  ) then
    raise exception 'MIGRATION_BASELINE_FAIL: rls missing';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260918132400' and name='engine'
  ) then
    raise exception 'MIGRATION_BASELINE_FAIL: engine missing';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260918132513' and name='security_hardening'
  ) then
    raise exception 'MIGRATION_BASELINE_FAIL: security_hardening missing';
  end if;

  select count(*)
    into table_count
    from information_schema.tables
   where table_schema='public'
     and table_type='BASE TABLE';

  if table_count <> 17 then
    raise exception 'SCHEMA_BASELINE_FAIL: expected 17 public tables, got %', table_count;
  end if;

  select count(*)
    into enum_count
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
   where n.nspname='public'
     and t.typtype='e';

  if enum_count <> 13 then
    raise exception 'SCHEMA_BASELINE_FAIL: expected 13 public enums, got %', enum_count;
  end if;

  select count(*)
    into schema_count
    from pg_namespace
   where nspname='private';

  if schema_count <> 1 then
    raise exception 'SCHEMA_BASELINE_FAIL: private schema missing';
  end if;

  select count(*)
    into required_count
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in (
       'create_barbershop',
       'get_available_slots',
       'get_available_days',
       'book_appointment',
       'list_members',
       'add_member_by_email',
       'seed_haircut_catalogue'
     );

  if required_count <> 7 then
    raise exception 'FUNCTION_BASELINE_FAIL: expected 7 core public functions, got %', required_count;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class cl on cl.oid=c.conrelid
    join pg_namespace n on n.oid=cl.relnamespace
    where n.nspname='public'
      and cl.relname='appointments'
      and c.conname='appointments_no_overlap'
  ) then
    raise exception 'CONSTRAINT_BASELINE_FAIL: appointments_no_overlap missing';
  end if;

  if not exists (
    select 1
    from information_schema.triggers
    where event_object_schema='public'
      and event_object_table='appointments'
      and trigger_name='appointments_completed'
  ) then
    raise exception 'TRIGGER_BASELINE_FAIL: appointments_completed missing';
  end if;

  if not exists (
    select 1
    from information_schema.triggers
    where event_object_schema='public'
      and trigger_name='prevent_tenant_move'
  ) then
    raise exception 'TRIGGER_BASELINE_FAIL: prevent_tenant_move missing';
  end if;
end
$$;

select
  'PASS' as status,
  'Phase 2 migration baseline' as check_name,
  'The live database matches the canonical migration contract.' as detail;
