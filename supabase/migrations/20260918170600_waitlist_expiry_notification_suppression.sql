-- BarberOS Phase 15 patch: stale waitlist offers must stop queued delivery before rotation.
create or replace function public.expire_waitlist_offer(
  p_token uuid
)
returns table(
  waitlist_entry_id uuid,
  status public.waitlist_status,
  next_offer_token uuid
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  w public.waitlist_entries%rowtype;
  v_next record;
begin
  select *
  into w
  from public.waitlist_entries
  where offer_token=p_token
  for update;

  if not found then
    raise exception 'WAITLIST_OFFER_NOT_FOUND';
  end if;

  if w.status <> 'offered' then
    return query select w.id,w.status,null::uuid;
    return;
  end if;

  if w.offer_expires_at is null or w.offer_expires_at > now() then
    raise exception 'WAITLIST_OFFER_STILL_ACTIVE';
  end if;

  update public.notifications n
  set status='skipped',
      error='waitlist_offer_expired'
  where n.waitlist_entry_id=w.id
    and n.status='queued'
    and n.template_key='waitlist_offer';

  update public.waitlist_entries
  set status='expired'
  where id=w.id;

  insert into public.audit_logs(
    barbershop_id,actor_id,action,entity,entity_id,diff
  )
  values(
    w.barbershop_id,null,'waitlist_offer_expired','waitlist_entry',w.id,
    jsonb_build_object('slot_start',w.offer_slot_start,'barber_id',w.offer_barber_id)
  );

  select *
  into v_next
  from private.offer_next_waitlist_core(
    w.barbershop_id,
    w.offer_slot_start,
    w.offer_barber_id
  );

  return query
  select w.id,w.status,v_next.offer_token;
end;
$function$;

revoke all on function public.expire_waitlist_offer(uuid)
from public,anon,authenticated;
grant execute on function public.expire_waitlist_offer(uuid) to anon,authenticated;

comment on function public.expire_waitlist_offer(uuid)
is 'Expires a lapsed waitlist offer, suppresses its queued delivery and immediately rotates the same slot to the next eligible customer.';
