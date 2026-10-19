begin;
select plan(7);

select ok(
  to_regprocedure('public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)') is not null,
  'idempotent booking RPC exists'
);

select ok(
  has_function_privilege('service_role', to_regprocedure('public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
  'service_role can execute idempotent booking RPC'
);

select ok(
  not has_function_privilege('anon', to_regprocedure('public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
  'anon cannot execute the raw booking RPC'
);

select ok(
  not has_function_privilege('authenticated', to_regprocedure('public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text,text)'), 'EXECUTE'),
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

select * from finish();
rollback;
