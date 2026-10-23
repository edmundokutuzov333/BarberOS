begin;
select plan(44);

select ok(
  to_regclass('public.appointments') is not null,
  'appointments table exists after migrations'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='password_change_required'
  ),
  'profiles contains the forced password rotation flag'
);

select ok(
  to_regclass('public.platform_access_events') is not null,
  'credential audit table exists'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.platform_access_events'::regclass),
  'credential audit table has RLS enabled'
);

select ok(
  not has_table_privilege('anon','public.platform_access_events','SELECT'),
  'anon cannot read credential audit history'
);

select ok(
  not has_table_privilege('authenticated','public.platform_access_events','SELECT'),
  'authenticated users cannot read credential audit history directly'
);

select ok(
  to_regprocedure('private.current_password_change_required(uuid)') is not null,
  'private password rotation guard exists'
);

select ok(
  not has_function_privilege('authenticated','private.current_password_change_required(uuid)','EXECUTE'),
  'authenticated users cannot execute the private password rotation helper'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='prof_update'
      and with_check ilike '%password_change_required%'
  ),
  'profile update policy prevents changing the password rotation flag directly'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='prof_update'
      and with_check not ilike '%current_password_change_required%'
  ),
  'profile update policy does not call an inaccessible private function'
);

select ok(
  to_regprocedure('public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)') is not null,
  'public booking boundary exists'
);

select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='book_appointment_core'
  ),
  'private booking core exists'
);

select ok(
  position(
    'private.book_appointment_core'
    in lower(pg_get_functiondef('public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)'::regprocedure))
  ) > 0,
  'public booking boundary delegates to the private core'
);

select ok(
  coalesce((
    select position('pg_advisory_xact_lock' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='book_appointment_core'
  ), false),
  'booking core uses a transaction-scoped advisory lock'
);

select ok(
  coalesce((
    select position('SLOT_TAKEN' in pg_get_functiondef(p.oid)) > 0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='book_appointment_core'
  ), false),
  'booking core maps unavailable concurrent slots to SLOT_TAKEN'
);

select ok(
  coalesce((
    select position('exclusion_violation' in lower(pg_get_functiondef(p.oid))) > 0
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='book_appointment_core'
  ), false),
  'booking core translates the exclusion constraint as the last concurrency barrier'
);

select ok(
  exists (select 1 from pg_constraint where conname='appointments_no_overlap'),
  'appointment overlap exclusion constraint exists'
);

select ok(
  not has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE'),
  'anon cannot execute the raw booking RPC'
);

select ok(
  not has_function_privilege('authenticated','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE'),
  'authenticated users cannot execute the raw booking RPC'
);

select ok(
  has_function_privilege('service_role','public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE'),
  'service_role can execute the idempotent booking RPC'
);

select ok(
  not has_table_privilege('anon','public.appointments','INSERT'),
  'anon cannot insert appointments directly'
);

select ok(
  not has_table_privilege('authenticated','public.appointments','INSERT'),
  'authenticated users cannot insert appointments directly'
);

select ok(
  not has_table_privilege('anon','public.appointments','UPDATE'),
  'anon cannot update appointments directly'
);

select ok(
  not has_table_privilege('authenticated','public.appointments','UPDATE'),
  'authenticated users cannot update appointments directly'
);

select ok(
  to_regclass('public.booking_idempotency') is not null,
  'idempotency cache exists'
);

select ok(
  not has_table_privilege('anon','public.booking_idempotency','SELECT'),
  'anon cannot read the booking idempotency cache'
);

select ok(
  not has_table_privilege('authenticated','public.booking_idempotency','SELECT'),
  'authenticated users cannot read the booking idempotency cache'
);

select ok(
  has_table_privilege('service_role','public.booking_idempotency','SELECT'),
  'service_role can read the booking idempotency cache'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.appointments'::regclass),
  'appointments has RLS enabled'
);

select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='services_public_shop_order_idx'),
  'public services query index exists'
);

select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='haircuts_public_shop_order_idx'),
  'public haircuts query index exists'
);

select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='barbers_public_shop_order_idx'),
  'public barbers query index exists'
);

select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='reviews_public_shop_created_idx'),
  'public reviews query index exists'
);

select ok(
  to_regprocedure('public.get_public_barbershop(text)') is not null,
  'public barbershop RPC exists'
);


select ok(
  to_regprocedure('public.rate_limit_consume(text,integer,integer)') is not null,
  'server-side rate limit RPC exists'
);

select ok(
  not has_function_privilege('anon','public.rate_limit_consume(text,integer,integer)','EXECUTE'),
  'anonymous callers cannot execute the rate limit RPC'
);

select ok(
  not has_function_privilege('authenticated','public.rate_limit_consume(text,integer,integer)','EXECUTE'),
  'authenticated callers cannot execute the rate limit RPC'
);

select ok(
  to_regclass('private.rate_limits') is not null
    and not has_table_privilege('anon','private.rate_limits','SELECT'),
  'rate limit buckets remain in the private schema and are not readable by anon'
);

select ok(
  to_regprocedure('public.get_available_slots_week(text,uuid,uuid,date)') is not null,
  'weekly availability RPC exists'
);

select ok(
  has_function_privilege('anon','public.get_available_slots_week(text,uuid,uuid,date)','EXECUTE'),
  'anonymous clients can read weekly availability through the intended RPC'
);

select ok(
  has_function_privilege('authenticated','public.get_available_slots_week(text,uuid,uuid,date)','EXECUTE'),
  'authenticated clients can read weekly availability through the intended RPC'
);


select ok(
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.routine_schema = 'public'
      and rp.grantee in ('PUBLIC', 'anon', 'authenticated')
      and (
        right(rp.routine_name, 9) = '_by_token'
        or rp.routine_name in (
          'get_payment_runtime_for_token',
          'init_payment_from_token',
          'get_waitlist_offer',
          'claim_waitlist_offer',
          'expire_waitlist_offer'
        )
      )
      and rp.privilege_type = 'EXECUTE'
  ),
  'token-management RPCs are not directly executable by public browser roles'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        right(p.proname, 9) = '_by_token'
        or p.proname in (
          'get_payment_runtime_for_token',
          'init_payment_from_token',
          'get_waitlist_offer',
          'claim_waitlist_offer',
          'expire_waitlist_offer'
        )
      )
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  'token-gateway service role retains access to token-management RPCs'
);


select is(
  (
    select count(*)::integer
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and (
            select array_agg(k.attnum::smallint order by k.ord)
            from unnest(i.indkey) with ordinality k(attnum, ord)
            where k.ord <= cardinality(con.conkey)
          ) = con.conkey
      )
  ),
  0,
  'every public foreign key has a covering leading-column index'
);

select * from finish();
rollback;
