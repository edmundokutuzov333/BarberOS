insert into public.working_hours (barbershop_id, barber_id, weekday, opens_at, closes_at, is_closed)
select sh.id, b.id, wh.weekday, wh.opens_at, wh.closes_at, wh.is_closed
from public.working_hours wh
join public.barbers b on b.barbershop_id=wh.barbershop_id and b.is_active
join public.barbershops sh on sh.id=b.barbershop_id
where wh.barber_id is null
  and sh.slug in ('magoanine-c','oryon','maputo-matola')
  and not exists (
    select 1 from public.working_hours existing
    where existing.barbershop_id=sh.id and existing.barber_id=b.id and existing.weekday=wh.weekday
  );