-- BarberOS Phase 13 patch: scope active waitlist-offer uniqueness by barber.
-- Two different barbers can legitimately have the same wall-clock slot.

drop index if exists public.waitlist_one_active_offer_per_slot_idx;

create unique index if not exists waitlist_one_active_offer_per_slot_idx
  on public.waitlist_entries(barbershop_id, offer_slot_start, offer_barber_id)
  where status='offered'
    and offer_slot_start is not null
    and offer_barber_id is not null;
