-- Catalog-only security acceptance; does not execute any payment/provider action.
begin;
do $test$
declare
  f record;
  checked integer := 0;
begin
  for f in
    select p.oid,p.oid::regprocedure::text as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname like '%\_by\_token' escape '\'
      or p.proname in ('get_payment_runtime_for_token','init_payment_from_token',
        'get_waitlist_offer','claim_waitlist_offer','expire_waitlist_offer',
        'get_payment_runtime_config','book_appointment','book_appointment_idempotent')
    )
  loop
    checked := checked + 1;
    if has_function_privilege('anon',f.oid,'execute')
      or has_function_privilege('authenticated',f.oid,'execute')
      or not has_function_privilege('service_role',f.oid,'execute') then
      raise exception 'TOKEN_GATEWAY_PRIVILEGE_VIOLATION: %',f.signature;
    end if;
  end loop;
  if checked < 15 then raise exception 'TOKEN_GATEWAY_AUDIT_SURFACE_INCOMPLETE: %',checked; end if;
end;
$test$;
rollback;
select 'TOKEN_GATEWAY_CATALOG_PRIVILEGES_PASSED' as result;
