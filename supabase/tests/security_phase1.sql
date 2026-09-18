-- BarberOS Phase 1 security acceptance assertions.
-- Read-only checks. Run against the target database after applying 0004_security_hardening.

do $$
begin
  if not has_function_privilege(
    'anon',
    'public.create_barbershop(text,text,text,text)',
    'EXECUTE'
  ) = false then
    raise exception 'SECURITY_FAIL: anon can execute create_barbershop';
  end if;

  if not has_function_privilege(
    'anon',
    'public.add_member_by_email(uuid,text,public.app_role)',
    'EXECUTE'
  ) = false then
    raise exception 'SECURITY_FAIL: anon can execute add_member_by_email';
  end if;

  if not has_function_privilege(
    'anon',
    'public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)',
    'EXECUTE'
  then
    raise exception 'SECURITY_FAIL: anon cannot execute required public booking RPC';
  end if;

  if has_table_privilege('anon','public.appointments','INSERT') then
    raise exception 'SECURITY_FAIL: anon has direct appointments INSERT';
  end if;

  if has_table_privilege('authenticated','public.appointments','INSERT') then
    raise exception 'SECURITY_FAIL: authenticated has direct appointments INSERT';
  end if;

  if has_table_privilege('anon','public.payments','UPDATE') then
    raise exception 'SECURITY_FAIL: anon has direct payments UPDATE';
  end if;

  if has_table_privilege('authenticated','public.payments','UPDATE') then
    raise exception 'SECURITY_FAIL: authenticated has direct payments UPDATE';
  end if;

  if has_table_privilege('authenticated','public.reviews','INSERT') then
    raise exception 'SECURITY_FAIL: authenticated has direct reviews INSERT';
  end if;

  if has_table_privilege('authenticated','public.waitlist_entries','DELETE') then
    raise exception 'SECURITY_FAIL: authenticated has direct waitlist DELETE';
  end if;

  if has_table_privilege('authenticated','public.notifications','UPDATE') then
    raise exception 'SECURITY_FAIL: authenticated has direct notifications UPDATE';
  end if;
end
$$;

select
  has_function_privilege('anon','public.book_appointment(text,uuid,uuid,uuid,timestamptz,text,text,text)','EXECUTE') as anon_booking_rpc_ok,
  has_function_privilege('anon','public.get_available_slots(text,uuid,uuid,date)','EXECUTE') as anon_slots_rpc_ok,
  has_function_privilege('anon','public.get_available_days(text,uuid,uuid,date,date)','EXECUTE') as anon_days_rpc_ok,
  has_function_privilege('authenticated','public.create_barbershop(text,text,text,text)','EXECUTE') as auth_create_shop_ok,
  has_function_privilege('authenticated','public.add_member_by_email(uuid,text,public.app_role)','EXECUTE') as auth_add_member_ok,
  has_table_privilege('anon','public.appointments','INSERT') as anon_direct_appointment_write,
  has_table_privilege('authenticated','public.appointments','INSERT') as auth_direct_appointment_write,
  has_table_privilege('anon','public.payments','UPDATE') as anon_direct_payment_write,
  has_table_privilege('authenticated','public.reviews','INSERT') as auth_direct_review_write;
