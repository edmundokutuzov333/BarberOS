create or replace function public.get_available_slots_week(
  p_slug text,
  p_service_id uuid,
  p_barber_id uuid default null,
  p_from date default current_date
)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(days.day::text, days.slots), '{}'::jsonb)
  from (
    select dates.day,
      coalesce((select jsonb_agg(jsonb_build_object('start', slots.slot_start, 'barbers', slots.barber_ids) order by slots.slot_start)
        from public.get_available_slots(p_slug, p_service_id, p_barber_id, dates.day) slots), '[]'::jsonb) as slots
    from (select (coalesce(p_from, current_date) + n)::date as day from generate_series(0, 6) n) dates
  ) days
$$;
revoke all on function public.get_available_slots_week(text, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.get_available_slots_week(text, uuid, uuid, date) to anon, authenticated;
