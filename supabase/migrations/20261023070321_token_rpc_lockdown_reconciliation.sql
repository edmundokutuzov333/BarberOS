-- Token management RPCs are exposed only through the validated token-gateway.
-- Apply only after token-gateway is deployed and verified in this environment.
do $block$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like '%\_by\_token' escape '\'
        or p.proname in (
          'get_payment_runtime_for_token',
          'init_payment_from_token',
          'get_waitlist_offer',
          'claim_waitlist_offer',
          'expire_waitlist_offer'
        )
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
    execute format('grant execute on function %s to service_role', fn.signature);
  end loop;
end;
$block$;
