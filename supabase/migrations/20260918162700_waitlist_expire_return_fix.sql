-- BarberOS Phase 13 patch: return the persisted expired status from the offer expiry RPC.

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

  update public.waitlist_entries
  set status='expired'
  where id=w.id;

  w.status := 'expired';

  insert into public.audit_logs(
    barbershop_id,
    actor_id,
    action,
    entity,
    entity_id,
    diff
  )
  values(
    w.barbershop_id,
    null,
    'waitlist_offer_expired',
    'waitlist_entry',
    w.id,
    jsonb_build_object(
      'slot_start',w.offer_slot_start,
      'barber_id',w.offer_barber_id
    )
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

grant execute on function public.expire_waitlist_offer(uuid) to anon,authenticated;
