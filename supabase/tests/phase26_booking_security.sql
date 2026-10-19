-- Run after migrations in an isolated database; raises on any privilege regression.
do $$
begin
  if has_function_privilege('anon', 'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: book_appointment is callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: idempotent booking RPC is callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.get_appointment_by_token(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_appointment_by_token(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_review_by_token(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_review_by_token(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_waitlist_offer(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_waitlist_offer(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.claim_waitlist_offer(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.claim_waitlist_offer(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.expire_waitlist_offer(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.expire_waitlist_offer(uuid)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: appointment, review or waitlist token RPC is callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.get_payment_runtime_for_token(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_payment_runtime_for_token(uuid)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: payment credentials RPC is callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.get_payment_status_by_token(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_payment_status_by_token(uuid)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: private payment status RPC is callable by browser roles';
  end if;

  if has_function_privilege('anon', 'public.init_payment_from_token(uuid,public.payment_provider,text,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.init_payment_from_token(uuid,public.payment_provider,text,uuid)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: payment initiation RPC is callable by browser roles';
  end if;

  if not has_function_privilege('service_role', 'public.book_appointment_idempotent(uuid,text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.get_payment_runtime_for_token(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.init_payment_from_token(uuid,public.payment_provider,text,uuid)', 'EXECUTE') then
    raise exception 'SECURITY_REGRESSION: Edge Function role cannot execute a required internal RPC';
  end if;

  if to_regclass('public.booking_idempotency') is null then
    raise exception 'SECURITY_REGRESSION: booking_idempotency table is missing';
  end if;

  if has_table_privilege('anon', 'public.booking_idempotency', 'SELECT')
    or has_table_privilege('authenticated', 'public.booking_idempotency', 'SELECT') then
    raise exception 'SECURITY_REGRESSION: browser role can read idempotency cache';
  end if;

  if not has_table_privilege('service_role', 'public.booking_idempotency', 'SELECT') then
    raise exception 'SECURITY_REGRESSION: Edge Function role cannot read idempotency cache';
  end if;
end
$$;
