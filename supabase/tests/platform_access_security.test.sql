begin;
select plan(6);

select ok(
  to_regclass('public.platform_access_events') is not null,
  'platform password-reset audit table exists'
);

select ok(
  exists (
    select 1 from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'password_change_required'
      and not attisdropped
  ),
  'profile carries only a password-change-required flag'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_access_events'::regclass),
  'credential audit table has row-level security enabled'
);

select ok(
  to_regprocedure('private.current_password_change_required(uuid)') is not null,
  'server-side password rotation gate exists'
);

select ok(
  not has_table_privilege('anon', 'public.platform_access_events', 'SELECT'),
  'anonymous users cannot read credential audit events'
);

select ok(
  not has_table_privilege('authenticated', 'public.platform_access_events', 'SELECT'),
  'authenticated users cannot read credential audit events directly'
);

select * from finish();
rollback;
