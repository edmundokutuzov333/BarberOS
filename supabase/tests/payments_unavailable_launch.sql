begin;
do $test$
declare rejected boolean; result public.payment_provider[]; shop uuid;
begin
 if has_table_privilege('authenticated','public.platform_settings','UPDATE') or has_function_privilege('authenticated','private.payments_available()','EXECUTE') then raise exception 'FAIL browser can change or execute private payment gate'; end if;
 if private.payments_available() then raise exception 'FAIL payments enabled'; end if;
 if exists(select 1 from public.barbershops where deposit_enabled) then raise exception 'FAIL shop deposit enabled'; end if;
 select payment_providers into result from public.get_public_payment_methods('any-shop');
 if cardinality(result)<>0 then raise exception 'FAIL advertised payment methods'; end if;
 rejected:=false;
 begin perform public.init_payment_from_token(gen_random_uuid(),'mpesa','258840000000',gen_random_uuid());
 exception when raise_exception then rejected:=sqlerrm='PAYMENTS_UNAVAILABLE'; end;
 if not rejected then raise exception 'FAIL payment initialization not blocked before token/provider access'; end if;
 rejected:=false;
 begin perform public.record_shop_order_payment(gen_random_uuid(),gen_random_uuid(),100,'cash',null,'Launch gate verification only',gen_random_uuid());
 exception when raise_exception then rejected:=sqlerrm='PAYMENTS_UNAVAILABLE'; end;
 if not rejected then raise exception 'FAIL manual payment recording not blocked'; end if;
 insert into public.barbershops(name,slug,status) values('Payment launch fixture','payment-gate-'||gen_random_uuid(),'trial') returning id into shop;
 rejected:=false;
 begin update public.barbershops set deposit_enabled=true where id=shop;
 exception when raise_exception then rejected:=sqlerrm='PAYMENTS_UNAVAILABLE'; end;
 if not rejected then raise exception 'FAIL deposit settings bypass'; end if;
 raise notice 'PASS payments unavailable: no advertised providers, no initialization, no manual ledger charge, no deposit activation; no external provider called.';
end;
$test$;
rollback;
