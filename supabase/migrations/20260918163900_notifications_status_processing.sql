-- BarberOS Phase 14: extend notification lifecycle for atomic dispatch claiming.
alter type public.notif_status add value if not exists 'processing';