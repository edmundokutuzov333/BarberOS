-- BarberOS Phase 15 patch: return the claimed notification set correctly from PL/pgSQL.
create or replace function public.claim_notifications(p_limit integer default 25)
returns table(
  id uuid, barbershop_id uuid, appointment_id uuid, waitlist_entry_id uuid,
  channel public.notif_channel, template_key text, recipient text, payload jsonb,
  scheduled_for timestamptz, attempts integer, customer_name text, customer_phone text,
  customer_email text, service_name text, haircut_name text, barber_name text,
  starts_at timestamptz, ends_at timestamptz, price_cents integer, duration_min integer,
  shop_name text, shop_slug text, shop_phone text, shop_whatsapp text, timezone text,
  manage_token uuid, offer_token uuid, offer_expires_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
declare v_limit integer := greatest(1,least(coalesce(p_limit,25),100));
begin
  return query
  with due as (
    select n.id
    from public.notifications n
    left join public.appointments a on a.id=n.appointment_id
    left join public.waitlist_entries w on w.id=n.waitlist_entry_id
    where n.status='queued'
      and n.scheduled_for <= now()
      and (n.next_attempt_at is null or n.next_attempt_at <= now())
      and (
        n.appointment_id is null
        or (n.template_key='appointment_pending' and a.status='pending')
        or (n.template_key='appointment_confirmed' and a.status='confirmed')
        or (n.template_key='appointment_cancelled' and a.status='cancelled')
        or (n.template_key='appointment_rescheduled' and a.status in ('pending','confirmed'))
        or (
          n.template_key in ('reminder_24h','reminder_1h')
          and a.status in ('pending','confirmed')
          and (
            a.deposit_status <> 'awaiting'
            or a.hold_expires_at is null
            or a.hold_expires_at > now()
          )
        )
        or (n.template_key='review_request' and a.status='completed')
      )
      and (
        n.waitlist_entry_id is null
        or (
          n.template_key='waitlist_offer'
          and w.status='offered'
          and w.offer_expires_at is not null
          and w.offer_expires_at > now()
        )
      )
    order by n.scheduled_for,n.id
    for update of n skip locked
    limit v_limit
  ),
  stale as (
    update public.notifications n
    set status='skipped',
        next_attempt_at=null,
        error='stale_notification_state'
    where n.status='queued'
      and n.scheduled_for <= now()
      and (
        (
          n.appointment_id is not null
          and not exists (
            select 1
            from public.appointments a
            where a.id=n.appointment_id
              and (
                (n.template_key='appointment_pending' and a.status='pending')
                or (n.template_key='appointment_confirmed' and a.status='confirmed')
                or (n.template_key='appointment_cancelled' and a.status='cancelled')
                or (n.template_key='appointment_rescheduled' and a.status in ('pending','confirmed'))
                or (
                  n.template_key in ('reminder_24h','reminder_1h')
                  and a.status in ('pending','confirmed')
                  and (
                    a.deposit_status <> 'awaiting'
                    or a.hold_expires_at is null
                    or a.hold_expires_at > now()
                  )
                )
                or (n.template_key='review_request' and a.status='completed')
              )
          )
        )
        or (
          n.waitlist_entry_id is not null
          and not exists (
            select 1
            from public.waitlist_entries w
            where w.id=n.waitlist_entry_id
              and n.template_key='waitlist_offer'
              and w.status='offered'
              and w.offer_expires_at is not null
              and w.offer_expires_at > now()
          )
        )
      )
    returning n.id
  ),
  claimed as (
    update public.notifications n
    set status='processing',
        attempts=n.attempts+1,
        last_attempt_at=now(),
        error=null
    from due
    where n.id=due.id
    returning n.*
  )
  select
    c.id,c.barbershop_id,c.appointment_id,c.waitlist_entry_id,c.channel,c.template_key,
    c.recipient,c.payload,c.scheduled_for,c.attempts,
    coalesce(cust.name,w.customer_name),
    coalesce(cust.phone,w.phone),
    coalesce(cust.email,w.email),
    coalesce(s_a.name,s_w.name),
    coalesce(h_a.name,h_w.name),
    coalesce(b_a.display_name,b_w_offer.display_name,b_w_pref.display_name),
    coalesce(a.starts_at,w.offer_slot_start),
    coalesce(a.ends_at,case
      when w.offer_slot_start is not null and s_w.duration_min is not null
      then w.offer_slot_start + make_interval(mins=>s_w.duration_min)
      else null end),
    coalesce(s_a.price_cents,s_w.price_cents),
    coalesce(s_a.duration_min,s_w.duration_min),
    sh.name,sh.slug,sh.phone,sh.whatsapp,sh.timezone,
    a.manage_token,w.offer_token,w.offer_expires_at
  from claimed c
  join public.barbershops sh on sh.id=c.barbershop_id
  left join public.appointments a on a.id=c.appointment_id
  left join public.customers cust on cust.id=a.customer_id
  left join public.waitlist_entries w on w.id=c.waitlist_entry_id
  left join public.services s_a on s_a.id=a.service_id
  left join public.services s_w on s_w.id=w.service_id
  left join public.haircuts h_a on h_a.id=a.haircut_id
  left join public.haircuts h_w on h_w.id=w.haircut_id
  left join public.barbers b_a on b_a.id=a.barber_id
  left join public.barbers b_w_offer on b_w_offer.id=w.offer_barber_id
  left join public.barbers b_w_pref on b_w_pref.id=w.barber_id
  order by c.scheduled_for,c.id;
end;
$function$;

revoke all on function public.claim_notifications(integer) from public,anon,authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
