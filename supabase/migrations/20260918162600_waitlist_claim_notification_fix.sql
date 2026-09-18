-- BarberOS Phase 13 patch: qualify notification waitlist reference during claim.

create or replace function public.claim_waitlist_offer(
  p_token uuid
)
returns table(
  waitlist_entry_id uuid,
  appointment_id uuid,
  manage_token uuid,
  status public.appointment_status,
  starts_at timestamptz,
  ends_at timestamptz,
  barber_id uuid,
  deposit_cents integer,
  needs_payment boolean
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  w public.waitlist_entries%rowtype;
  sh public.barbershops%rowtype;
  r record;
  v_error text;
begin
  select * into w
  from public.waitlist_entries
  where offer_token=p_token
  for update;

  if not found then
    raise exception 'WAITLIST_OFFER_NOT_FOUND';
  end if;

  if w.status <> 'offered' then
    raise exception 'WAITLIST_OFFER_NOT_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'waitlist-slot:' || w.barbershop_id::text || ':' || w.offer_barber_id::text || ':' || w.offer_slot_start::text,
      0
    )
  );

  select * into w
  from public.waitlist_entries
  where id=w.id
  for update;

  if w.offer_expires_at is null or w.offer_expires_at <= now() then
    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_OFFER_EXPIRED';
  end if;

  select b.*
  into sh
  from public.barbershops b
  where b.id=w.barbershop_id
    and b.status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  begin
    select *
    into r
    from private.book_appointment_core(
      sh.slug,
      w.service_id,
      w.haircut_id,
      w.offer_barber_id,
      w.offer_slot_start,
      w.customer_name,
      w.phone,
      w.email,
      'waitlist'::public.booking_source,
      null,
      'Waitlist claim'
    );

    update public.waitlist_entries
    set status='converted'
    where id=w.id;

    update public.notifications n
    set status='skipped',
        error='waitlist_converted'
    where n.waitlist_entry_id=w.id
      and n.status='queued'
      and n.template_key='waitlist_offer';

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
      auth.uid(),
      'waitlist_converted',
      'waitlist_entry',
      w.id,
      jsonb_build_object(
        'appointment_id',r.appointment_id,
        'slot_start',w.offer_slot_start
      )
    );

    return query
    select
      w.id,
      r.appointment_id,
      r.manage_token,
      (
        select a.status
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.starts_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      (
        select a.ends_at
        from public.appointments a
        where a.id=r.appointment_id
      ),
      w.offer_barber_id,
      r.deposit_cents,
      r.needs_payment;

    return;
  exception
    when others then
      v_error := sqlerrm;
  end;

  if position('SLOT_TAKEN' in coalesce(v_error,'')) > 0
     or position('SLOT_UNAVAILABLE' in coalesce(v_error,'')) > 0 then

    update public.waitlist_entries
    set status='expired'
    where id=w.id;

    perform private.offer_next_waitlist_core(
      w.barbershop_id,
      w.offer_slot_start,
      w.offer_barber_id
    );

    raise exception 'WAITLIST_SLOT_TAKEN';
  end if;

  raise exception '%',v_error;
end;
$function$;

revoke all on function public.claim_waitlist_offer(uuid)
from public,anon,authenticated;
grant execute on function public.claim_waitlist_offer(uuid)
to anon,authenticated;
