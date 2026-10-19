create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;
insert into public.platform_settings(key, value) values ('notifications', '{"email": true, "whatsapp": false}'::jsonb) on conflict (key) do nothing;

create or replace function private.channel_enabled(p_channel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> p_channel)::boolean from public.platform_settings where key='notifications'), false)
$$;
revoke all on function private.channel_enabled(text) from public, anon, authenticated;

update public.notifications set status='skipped', error='CHANNEL_DISABLED'
where channel='whatsapp' and status in ('queued','processing') and not private.channel_enabled('whatsapp');

-- Recreate the notification producer with the platform channel switch applied at enqueue time.
create or replace function public.enqueue_appointment_notifications(p_appt uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  a public.appointments%rowtype; v_phone text; v_email text; v_template text;
begin
  select * into a from public.appointments where id=p_appt;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  select c.phone,c.email into v_phone,v_email from public.customers c where c.id=a.customer_id and c.barbershop_id=a.barbershop_id;
  v_template := case when a.status='pending' then 'appointment_pending' else 'appointment_confirmed' end;
  if v_phone is not null and private.channel_enabled('whatsapp') then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (a.barbershop_id,a.id,'whatsapp',v_template,v_phone,now(),jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    if a.starts_at - interval '24 hours' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values (a.barbershop_id,a.id,'whatsapp','reminder_24h',v_phone,a.starts_at-interval '24 hours',jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    end if;
    if a.starts_at - interval '2 hours' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values (a.barbershop_id,a.id,'whatsapp','reminder_1h',v_phone,a.starts_at-interval '2 hours',jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    end if;
  end if;
  if v_email is not null and private.channel_enabled('email') then
    insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
    values (a.barbershop_id,a.id,'email',v_template,v_email,now(),jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    if a.starts_at - interval '24 hours' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values (a.barbershop_id,a.id,'email','reminder_24h',v_email,a.starts_at-interval '24 hours',jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    end if;
    if a.starts_at - interval '2 hours' > now() then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values (a.barbershop_id,a.id,'email','reminder_1h',v_email,a.starts_at-interval '2 hours',jsonb_build_object('manage_token',a.manage_token,'appointment_id',a.id));
    end if;
  end if;
end $$;
revoke all on function public.enqueue_appointment_notifications(uuid) from public, anon, authenticated;

alter table public.notifications add column if not exists delivered_at timestamptz, add column if not exists bounced_at timestamptz;
create or replace function public.record_email_event(p_provider_message_id text, p_event text)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.notifications n set delivered_at=case when p_event='delivered' then now() else n.delivered_at end,
    bounced_at=case when p_event in ('bounced','complained') then now() else n.bounced_at end,
    error=case when p_event in ('bounced','complained') then 'EMAIL_'||upper(p_event) else n.error end
  where n.provider_message_id=p_provider_message_id and n.channel='email';
end $$;
revoke all on function public.record_email_event(text,text) from public, anon, authenticated;
grant execute on function public.record_email_event(text,text) to service_role;
