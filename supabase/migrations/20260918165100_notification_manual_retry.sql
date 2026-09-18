-- BarberOS Phase 14 patch: operator-controlled retry for failed notifications.
create or replace function public.retry_notification(
  p_shop uuid,
  p_notification uuid
)
returns table(
  notification_id uuid,
  status public.notif_status,
  attempts integer
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.notifications%rowtype;
begin
  perform private.require_shop_operator(p_shop);

  select *
  into v_row
  from public.notifications
  where id=p_notification
    and barbershop_id=p_shop
  for update;

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;

  if v_row.status <> 'failed' then
    raise exception 'NOTIFICATION_NOT_RETRYABLE';
  end if;

  update public.notifications
  set status='queued',
      attempts=0,
      last_attempt_at=null,
      next_attempt_at=now(),
      sent_at=null,
      provider_message_id=null,
      error='manually_requeued',
      fallback_url=null
  where id=v_row.id
  returning id,status,attempts
  into notification_id,status,attempts;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values(
    p_shop,auth.uid(),'notification_requeued','notification',v_row.id,
    jsonb_build_object('previous_status',v_row.status,'previous_attempts',v_row.attempts)
  );

  return next;
end;
$function$;

revoke all on function public.retry_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_notification(uuid,uuid) to authenticated;

comment on function public.retry_notification(uuid,uuid)
is 'Operator-controlled retry of a failed notification. Resets the delivery attempt window and records an audit event.';
