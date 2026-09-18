-- BarberOS Phase 13 patch: qualify offer columns inside the waitlist allocator.

create or replace function private.offer_next_waitlist_core(
  p_shop uuid,
  p_slot_start timestamptz,
  p_barber_id uuid
)
returns table(
  waitlist_entry_id uuid,
  offer_token uuid,
  offer_expires_at timestamptz,
  customer_name text,
  phone text,
  email text,
  service_id uuid,
  haircut_id uuid,
  barber_id uuid,
  slot_start timestamptz
)
language plpgsql
security definer
set search_path=''
as $function$
declare
  sh public.barbershops%rowtype;
  w public.waitlist_entries%rowtype;
  v_date date;
  v_available boolean;
  v_offer_token uuid;
  v_expires timestamptz;
begin
  if p_shop is null or p_slot_start is null or p_barber_id is null then
    raise exception 'WAITLIST_SLOT_REQUIRED';
  end if;

  select * into sh
  from public.barbershops
  where id=p_shop
    and status in ('trial','active');

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.barbers b
    where b.id=p_barber_id
      and b.barbershop_id=p_shop
      and b.is_active
  ) then
    raise exception 'BARBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'waitlist-slot:' || p_shop::text || ':' || p_barber_id::text || ':' || p_slot_start::text,
      0
    )
  );

  v_date := (p_slot_start at time zone sh.timezone)::date;

  update public.waitlist_entries we
  set status='expired'
  where we.barbershop_id=p_shop
    and we.status='offered'
    and we.offer_slot_start=p_slot_start
    and we.offer_barber_id=p_barber_id
    and we.offer_expires_at <= now();

  if exists (
    select 1
    from public.waitlist_entries active_offer
    where active_offer.barbershop_id=p_shop
      and active_offer.status='offered'
      and active_offer.offer_slot_start=p_slot_start
      and active_offer.offer_barber_id=p_barber_id
      and active_offer.offer_expires_at > now()
  ) then
    return;
  end if;

  for w in
    select we.*
    from public.waitlist_entries we
    where we.barbershop_id=p_shop
      and we.status='waiting'
      and exists (
        select 1
        from public.services s
        where s.id=we.service_id
          and s.barbershop_id=p_shop
          and s.is_active
      )
      and (we.barber_id is null or we.barber_id=p_barber_id)
      and (we.date_from is null or v_date >= we.date_from)
      and (we.date_to is null or v_date <= we.date_to)
      and private.waitlist_period_matches(
        we.period,
        p_slot_start,
        sh.timezone
      )
    order by we.created_at,we.id
    for update skip locked
  loop
    select exists (
      select 1
      from public.get_available_slots(
        sh.slug,
        w.service_id,
        p_barber_id,
        v_date
      ) av
      where av.slot_start=p_slot_start
    )
    into v_available;

    if v_available then
      v_offer_token := gen_random_uuid();
      v_expires := now() + interval '15 minutes';

      update public.waitlist_entries we
      set status='offered',
          offer_token=v_offer_token,
          offer_slot_start=p_slot_start,
          offer_barber_id=p_barber_id,
          offer_expires_at=v_expires
      where we.id=w.id
      returning
        we.id,
        we.offer_token,
        we.offer_expires_at,
        we.customer_name,
        we.phone,
        we.email,
        we.service_id,
        we.haircut_id,
        we.barber_id,
        we.offer_slot_start
      into
        waitlist_entry_id,
        offer_token,
        offer_expires_at,
        customer_name,
        phone,
        email,
        service_id,
        haircut_id,
        barber_id,
        slot_start;

      insert into public.notifications(
        barbershop_id,
        waitlist_entry_id,
        channel,
        template_key,
        recipient,
        scheduled_for,
        payload
      )
      values(
        p_shop,
        waitlist_entry_id,
        'whatsapp',
        'waitlist_offer',
        phone,
        now(),
        jsonb_build_object(
          'offer_token',offer_token,
          'slot_start',slot_start,
          'expires_at',offer_expires_at,
          'service_id',service_id,
          'barber_id',barber_id,
          'shop_slug',sh.slug,
          'shop_name',sh.name
        )
      );

      if email is not null then
        insert into public.notifications(
          barbershop_id,
          waitlist_entry_id,
          channel,
          template_key,
          recipient,
          scheduled_for,
          payload
        )
        values(
          p_shop,
          waitlist_entry_id,
          'email',
          'waitlist_offer',
          email,
          now(),
          jsonb_build_object(
            'offer_token',offer_token,
            'slot_start',slot_start,
            'expires_at',offer_expires_at,
            'service_id',service_id,
            'barber_id',barber_id,
            'shop_slug',sh.slug,
            'shop_name',sh.name
          )
        );
      end if;

      insert into public.audit_logs(
        barbershop_id,actor_id,action,entity,entity_id,diff
      )
      values(
        p_shop,
        auth.uid(),
        'waitlist_offer_created',
        'waitlist_entry',
        waitlist_entry_id,
        jsonb_build_object(
          'slot_start',slot_start,
          'barber_id',barber_id,
          'offer_expires_at',offer_expires_at
        )
      );

      return next;
      return;
    end if;
  end loop;
end;
$function$;
