-- Read-only domain acceptance against an intentionally absent shop. Valid phones
-- must advance to shop lookup; invalid phones must fail before any data mutation.
begin;
do $test$
declare
  c record;
  actual text;
begin
  if exists(select 1 from public.barbershops where slug='barberos-phone-contract-no-such-tenant') then
    raise exception 'PHONE_AUDIT_SLUG_MUST_BE_ABSENT';
  end if;
  for c in select * from (values
    ('+258821234567',true),('258831234567',true),('841234567',true),
    ('85 123-4567',true),('+258861234567',true),('871234567',true),
    (null::text,false),('',false),('811234567',false),('881234567',false),
    ('82123456',false),('8212345670',false),('+25882123456a',false),
    ('++258821234567',false),('+2588/1234567',false),('+25882١٢٣٤٥٦٧',false)
  ) as cases(phone,valid)
  loop
    actual := null;
    begin
      perform * from private.book_appointment_core(
        'barberos-phone-contract-no-such-tenant',null::uuid,null::uuid,null::uuid,
        now()+interval '1 day','QA',c.phone,null::text,'online'::public.booking_source,
        null::uuid,null::text
      );
    exception when others then
      get stacked diagnostics actual = message_text;
    end;
    if actual is distinct from (case when c.valid then 'BARBERSHOP_NOT_FOUND' else 'INVALID_PHONE' end) then
      raise exception 'PHONE_BOUNDARY_CONTRACT_FAILED: expected validity %, got %',c.valid,actual;
    end if;
  end loop;
end;
$test$;
rollback;
select 'BOOKING_PHONE_BOUNDARY_16_CASES_PASSED' as result;
