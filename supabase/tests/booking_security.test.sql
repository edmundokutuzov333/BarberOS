begin;
select plan(12);

select ok(
  to_regprocedure('public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)') is not null,
  'idempotent booking RPC exists'
);

select ok(
  has_function_privilege('service_role', to_regprocedure('public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
  'service_role can execute idempotent booking RPC'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
  'anon cannot execute the raw booking RPC'
);

select ok(
  not has_function_privilege('authenticated', to_regprocedure('public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
  'authenticated cannot execute the raw booking RPC'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.get_appointment_by_token(uuid)'), 'EXECUTE'),
  'anon cannot execute appointment token RPCs directly'
);

select ok(
  not has_function_privilege('authenticated', to_regprocedure('public.get_appointment_by_token(uuid)'), 'EXECUTE'),
  'authenticated cannot execute appointment token RPCs directly'
);

select ok(
  has_function_privilege('service_role', to_regprocedure('public.get_appointment_by_token(uuid)'), 'EXECUTE'),
  'service_role can execute appointment token RPC through the gateway'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.get_waitlist_offer(uuid)'), 'EXECUTE'),
  'anon cannot read waitlist offers through a direct RPC'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.claim_waitlist_offer(uuid)'), 'EXECUTE'),
  'anon cannot claim waitlist offers through a direct RPC'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.expire_waitlist_offer(uuid)'), 'EXECUTE'),
  'anon cannot expire waitlist offers through a direct RPC'
);


select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'manage_token_expires_at'
  ),
  'appointment management token expiry column exists'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'appointments_manage_token_expiry'
      and not tgisinternal
  ),
  'new appointments automatically receive a management token expiry'
);

select * from finish();
rollback;
