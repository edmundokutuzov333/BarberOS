-- BarberOS FASE 24 concurrency contract.
-- Read-only. It verifies the database-side last-mile concurrency guarantees.

do $phase24$
declare
  v_def text;
  v_count integer;
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='appointments_no_overlap'
  ) then
    raise exception 'PHASE24_OVERLAP_CONSTRAINT_MISSING';
  end if;

  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='book_appointment'
    and pg_get_function_identity_arguments(p.oid)
      = 'p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text';

  if v_def is null then
    raise exception 'PHASE24_BOOKING_FUNCTION_MISSING';
  end if;

  if position('pg_advisory_xact_lock' in v_def) = 0 then
    raise exception 'PHASE24_ADVISORY_LOCK_MISSING';
  end if;

  if position('SLOT_TAKEN' in v_def) = 0 then
    raise exception 'PHASE24_SLOT_TAKEN_CONTRACT_MISSING';
  end if;

  if position('exclusion_violation' in lower(v_def)) = 0 then
    raise exception 'PHASE24_EXCLUSION_TRANSLATION_MISSING';
  end if;

  if has_table_privilege('anon','public.appointments','INSERT')
     or has_table_privilege('authenticated','public.appointments','INSERT')
  then
    raise exception 'PHASE24_DIRECT_APPOINTMENT_INSERT_EXPOSED';
  end if;

  if not has_function_privilege(
    'anon',
    'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)',
    'execute'
  ) then
    raise exception 'PHASE24_PUBLIC_BOOKING_RPC_MISSING';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='get_available_slots'
  ) then
    raise exception 'PHASE24_AVAILABILITY_DEPENDENCY_MISSING';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='book_appointment';

  if v_count <> 1 then
    raise exception 'PHASE24_BOOKING_FUNCTION_AMBIGUOUS:%',v_count;
  end if;

  raise notice 'PASS | Phase 24 database concurrency contract';
end
$phase24$;
