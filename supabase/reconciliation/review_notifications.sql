-- New completions use a configured channel and an actual customer destination.
-- Existing review-request rows are preserved; no historical email is replayed.
create or replace function public.on_appointment_completed()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_phone text; v_email text; v_channel public.notifications.channel%type; v_recipient text;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at:=coalesce(new.completed_at,now());
    select c.phone,nullif(btrim(c.email),'') into v_phone,v_email
      from public.customers c where c.id=new.customer_id and c.barbershop_id=new.barbershop_id;
    if v_email is not null and private.channel_enabled('email') then
      v_channel:='email'; v_recipient:=v_email;
    elsif v_phone is not null and private.channel_enabled('whatsapp') then
      v_channel:='whatsapp'; v_recipient:=v_phone;
    end if;
    if v_recipient is not null then
      insert into public.notifications(barbershop_id,appointment_id,channel,template_key,recipient,scheduled_for,payload)
      values(new.barbershop_id,new.id,v_channel,'review_request',v_recipient,new.completed_at+interval '1 hour',jsonb_build_object('manage_token',new.manage_token))
      on conflict(appointment_id,template_key) where appointment_id is not null and template_key='review_request' do nothing;
    else
      insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
        values(new.barbershop_id,auth.uid(),'review_notification_skipped','appointment',new.id,
          jsonb_build_object('reason','NO_ENABLED_RECIPIENT'));
    end if;
    update public.customers set visits_count=visits_count+1,last_visit_at=new.completed_at
      where id=new.customer_id and barbershop_id=new.barbershop_id;
  end if;
  if new.status='no_show' and old.status is distinct from 'no_show' then
    new.no_show_at:=coalesce(new.no_show_at,now());
    update public.customers set no_show_count=no_show_count+1
      where id=new.customer_id and barbershop_id=new.barbershop_id;
  end if;
  return new;
end;
$function$;
revoke all on function public.on_appointment_completed() from public,anon,authenticated;
grant execute on function public.on_appointment_completed() to service_role;
