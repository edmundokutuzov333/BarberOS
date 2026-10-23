begin;
select plan(9);

select ok(
  to_regclass('public.resend_email_events') is not null,
  'Resend provider event ledger exists'
);
select ok(
  to_regprocedure('public.record_email_event(text,text,text)') is not null,
  'Resend event RPC exists'
);
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.resend_email_events'::regclass),
  'RLS is enabled on the event ledger'
);
select ok(
  not has_table_privilege('anon', 'public.resend_email_events', 'SELECT'),
  'anonymous clients cannot read provider events'
);
select ok(
  not has_function_privilege('anon', 'public.record_email_event(text,text,text)', 'EXECUTE'),
  'anonymous clients cannot invoke the provider event RPC'
);
select ok(
  has_function_privilege('service_role', 'public.record_email_event(text,text,text)', 'EXECUTE'),
  'service_role can invoke the provider event RPC'
);
select lives_ok(
  $$ select public.record_email_event('ci-email-message', 'delivered', 'ci-svix-event') $$,
  'a valid delivery event is stored'
);
select lives_ok(
  $$ select public.record_email_event('ci-email-message', 'delivered', 'ci-svix-event') $$,
  'a duplicate provider event is accepted idempotently'
);
select is(
  (select count(*)::integer from public.resend_email_events where provider_event_id = 'ci-svix-event'),
  1,
  'provider event IDs are deduplicated'
);

select * from finish();
rollback;
