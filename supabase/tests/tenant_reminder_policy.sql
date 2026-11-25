begin;
do $qa$
declare sh uuid; nt uuid; nt2 uuid; nt3 uuid;
begin
 insert into public.barbershops(slug,name,status,timezone,reminder_24h_enabled) values('reminder-qa-'||replace(gen_random_uuid()::text,'-',''),'Reminder QA','active','Africa/Maputo',false) returning id into sh;
 -- Staging auto-enrolls new shops into a simulator that suppresses all external notification inserts.
 -- Remove only this uncommitted fixture from that guard; rollback prevents any dispatch.
 delete from private.payment_checkout_test_shops where shop_id=sh;
 insert into public.notifications(barbershop_id,channel,template_key,recipient,scheduled_for,payload) values(sh,'email','reminder_24h','qa@example.invalid',now()+interval '1 day','{}') returning id into nt;
 if nt is null then raise exception 'FAIL fixture insertion suppressed';end if;
 update public.notifications set status='queued',error=null where id=nt;
 if not exists(select 1 from public.notifications where id=nt and status='skipped' and error='SHOP_REMINDER_DISABLED') then raise exception 'FAIL disabled reminder retry';end if;
 insert into public.notifications(barbershop_id,channel,template_key,recipient,scheduled_for,payload) values(sh,'email','reminder_1h','qa@example.invalid',now()+interval '1 day','{}') returning id into nt2;
 update public.notifications set status='queued',error=null where id=nt2;
 if not exists(select 1 from public.notifications where id=nt2 and status='queued') then raise exception 'FAIL enabled reminder';end if;
 update public.barbershops set reminder_1h_enabled=false where id=sh;
 if not exists(select 1 from public.notifications where id=nt2 and status='skipped' and error='SHOP_REMINDER_DISABLED') then raise exception 'FAIL existing queue';end if;
 update public.barbershops set reminder_24h_enabled=true where id=sh;
 update public.notifications set status='queued',error=null where id=nt;
 if not exists(select 1 from public.notifications where id=nt and status='queued') then raise exception 'FAIL reenabled reminder';end if;
end $qa$;
rollback;