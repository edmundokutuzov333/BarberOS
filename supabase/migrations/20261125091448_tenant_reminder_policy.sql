alter table public.barbershops add column reminder_24h_enabled boolean not null default true,
 add column reminder_1h_enabled boolean not null default true;
grant select(reminder_24h_enabled,reminder_1h_enabled),update(reminder_24h_enabled,reminder_1h_enabled) on public.barbershops to authenticated;
create function private.enforce_shop_reminder_policy() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 if new.template_key in ('reminder_24h','reminder_1h') and new.status='queued'
 and exists(select 1 from public.barbershops b where b.id=new.barbershop_id and
 ((new.template_key='reminder_24h' and not b.reminder_24h_enabled) or (new.template_key='reminder_1h' and not b.reminder_1h_enabled))) then
 new.status:='skipped'; new.error:='SHOP_REMINDER_DISABLED';new.next_attempt_at:=null;
 end if;
 return new;
end $fn$;
revoke all on function private.enforce_shop_reminder_policy() from public,anon,authenticated;
create trigger shop_reminder_policy before insert or update of status on public.notifications for each row execute function private.enforce_shop_reminder_policy();
create function private.skip_disabled_shop_reminders() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 update public.notifications n set status='skipped',error='SHOP_REMINDER_DISABLED',next_attempt_at=null
 where n.barbershop_id=new.id and n.status='queued' and
 ((n.template_key='reminder_24h' and not new.reminder_24h_enabled) or (n.template_key='reminder_1h' and not new.reminder_1h_enabled));
 return new;
end $fn$;
revoke all on function private.skip_disabled_shop_reminders() from public,anon,authenticated;
create trigger shop_reminder_policy_changed after update of reminder_24h_enabled,reminder_1h_enabled on public.barbershops
 for each row when(old.reminder_24h_enabled is distinct from new.reminder_24h_enabled or old.reminder_1h_enabled is distinct from new.reminder_1h_enabled)
 execute function private.skip_disabled_shop_reminders();
