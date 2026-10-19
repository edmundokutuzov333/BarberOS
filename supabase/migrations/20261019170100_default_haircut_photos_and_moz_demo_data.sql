-- Repeatable visual catalogue seed and fictional Mozambique-based demo profiles.
-- Photos are Pexels reference photos; shop covers/logos, staff names and contacts are demo data,
-- not verified images or details of real establishments.

create temporary table default_haircut_catalog (
  name text primary key,
  description text not null,
  photo_url text not null,
  price_cents integer not null,
  duration_min integer not null,
  sort_order integer not null
);

insert into pg_temp.default_haircut_catalog (name, description, photo_url, price_cents, duration_min, sort_order)
values
  ('Low fade', 'Degradê baixo, junto à orelha e nuca.', 'https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 1),
  ('Mid fade', 'Degradê a meia altura, equilibrado.', 'https://images.pexels.com/photos/17086220/pexels-photo-17086220.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 2),
  ('High fade', 'Degradê alto, contraste forte.', 'https://images.pexels.com/photos/6487911/pexels-photo-6487911.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 35, 3),
  ('Taper fade', 'Degradê suave só nas patilhas e nuca.', 'https://images.pexels.com/photos/7781848/pexels-photo-7781848.jpeg?auto=compress&cs=tinysrgb&w=1200', 25000, 25, 4),
  ('Skin fade', 'Degradê até à pele.', 'https://images.pexels.com/photos/4456516/pexels-photo-4456516.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 35, 5),
  ('Drop fade', 'Degradê que desce em curva atrás da orelha.', 'https://images.pexels.com/photos/7697319/pexels-photo-7697319.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 35, 6),
  ('Burst fade', 'Degradê em leque à volta da orelha.', 'https://images.pexels.com/photos/35157692/pexels-photo-35157692.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 40, 7),
  ('Buzz cut', 'Máquina uniforme, muito curto.', 'https://images.pexels.com/photos/11744656/pexels-photo-11744656.jpeg?auto=compress&cs=tinysrgb&w=1200', 20000, 20, 8),
  ('Crew cut', 'Curto, topo ligeiramente mais longo.', 'https://images.pexels.com/photos/23531768/pexels-photo-23531768.jpeg?auto=compress&cs=tinysrgb&w=1200', 25000, 25, 9),
  ('Caesar', 'Franja curta e recta, textura no topo.', 'https://images.pexels.com/photos/7447151/pexels-photo-7447151.jpeg?auto=compress&cs=tinysrgb&w=1200', 25000, 25, 10),
  ('French crop', 'Franja texturizada com laterais curtas.', 'https://images.pexels.com/photos/9102985/pexels-photo-9102985.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 11),
  ('Pompadour', 'Volume para cima e para trás.', 'https://images.pexels.com/photos/5337943/pexels-photo-5337943.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 35, 12),
  ('Quiff', 'Volume frontal, mais solto que o pompadour.', 'https://images.pexels.com/photos/10090668/pexels-photo-10090668.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 13),
  ('Slick back', 'Penteado para trás, liso.', 'https://images.pexels.com/photos/32964273/pexels-photo-32964273.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 14),
  ('Afro shape-up', 'Afro contornado com linhas definidas.', 'https://images.pexels.com/photos/12414341/pexels-photo-12414341.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 30, 15),
  ('Waves', 'Ondas 360 com escova.', 'https://images.pexels.com/photos/5839954/pexels-photo-5839954.jpeg?auto=compress&cs=tinysrgb&w=1200', 35000, 35, 16),
  ('Twists', 'Torções curtas definidas.', 'https://images.pexels.com/photos/1845923/pexels-photo-1845923.jpeg?auto=compress&cs=tinysrgb&w=1200', 40000, 45, 17),
  ('Dreads retwist', 'Manutenção e retorção de dreads.', 'https://images.pexels.com/photos/19028067/pexels-photo-19028067.jpeg?auto=compress&cs=tinysrgb&w=1200', 45000, 50, 18),
  ('Corte à tesoura', 'Só tesoura, acabamento natural.', 'https://images.pexels.com/photos/14072328/pexels-photo-14072328.jpeg?auto=compress&cs=tinysrgb&w=1200', 30000, 35, 19),
  ('Corte infantil', 'Corte para crianças, rápido e calmo.', 'https://images.pexels.com/photos/7697356/pexels-photo-7697356.jpeg?auto=compress&cs=tinysrgb&w=1200', 20000, 25, 20),
  ('Design freestyle', 'Desenhos à navalha ao gosto do cliente.', 'https://images.pexels.com/photos/35276951/pexels-photo-35276951.jpeg?auto=compress&cs=tinysrgb&w=1200', 40000, 45, 21),
  ('Careca à navalha', 'Rapado total com navalha.', 'https://images.pexels.com/photos/17492272/pexels-photo-17492272.jpeg?auto=compress&cs=tinysrgb&w=1200', 25000, 30, 22);

-- A shop's uploaded photo always wins; only null/blank values receive the default photograph.
update public.haircuts h
set photo_url = coalesce(nullif(btrim(h.photo_url), ''), c.photo_url),
    description = coalesce(nullif(btrim(h.description), ''), c.description),
    price_cents = coalesce(h.price_cents, c.price_cents),
    duration_min = coalesce(h.duration_min, c.duration_min),
    sort_order = c.sort_order
from pg_temp.default_haircut_catalog c
where lower(h.name) = lower(c.name);

-- Give every existing barbershop the same 22 visual catalog entries without duplicating rows.
insert into public.haircuts (barbershop_id, service_id, name, description, photo_url, price_cents, duration_min, is_active, sort_order)
select b.id, null, c.name, c.description, c.photo_url, c.price_cents, c.duration_min, true, c.sort_order
from public.barbershops b
cross join pg_temp.default_haircut_catalog c
where not exists (
  select 1 from public.haircuts existing
  where existing.barbershop_id = b.id and lower(existing.name) = lower(c.name)
);

-- Replace QA-only labels on Oryon's two demonstration services, retaining their identifiers.
with qa_services as (
  select s.id, row_number() over (order by s.id) as ordinal
  from public.services s
  join public.barbershops b on b.id = s.barbershop_id
  where b.slug = 'oryon' and s.name = 'QA Corte'
)
update public.services s
set name = case qa.ordinal when 1 then 'Corte Clássico' else 'Corte + Barba' end,
    price_cents = case qa.ordinal when 1 then 25000 else 40000 end,
    duration_min = case qa.ordinal when 1 then 30 else 45 end,
    requires_deposit = false,
    is_active = true,
    sort_order = qa.ordinal
from qa_services qa
where s.id = qa.id;

-- Sample price list in MT for the Maputo/Matola demo profiles.
insert into public.services (barbershop_id, name, price_cents, duration_min, requires_deposit, is_active, sort_order)
select b.id, v.name, v.price_cents, v.duration_min, false, true, v.sort_order
from public.barbershops b
cross join (values
  ('Corte Clássico'::text, 25000, 30, 1),
  ('Corte + Barba'::text, 40000, 45, 2),
  ('Barba e Acabamento'::text, 15000, 20, 3),
  ('Corte Infantil'::text, 20000, 25, 4)
) v(name, price_cents, duration_min, sort_order)
where not exists (
  select 1 from public.services existing
  where existing.barbershop_id = b.id and lower(existing.name) = lower(v.name)
);

-- Keep real ratings only; create no synthetic reviews.
with ranked_barbers as (
  select br.id, sh.slug,
         row_number() over (partition by br.barbershop_id order by br.sort_order, br.id) as rn
  from public.barbers br
  join public.barbershops sh on sh.id = br.barbershop_id
)
update public.barbers br
set display_name = case rb.slug
      when 'magoanine-c' then 'Dércio Mucavele'
      when 'oryon' then 'Edson Mucavele'
      else 'Celso Nhantumbo'
    end,
    photo_url = case rb.slug
      when 'magoanine-c' then 'https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200'
      when 'oryon' then 'https://images.pexels.com/photos/17086220/pexels-photo-17086220.jpeg?auto=compress&cs=tinysrgb&w=1200'
      else 'https://images.pexels.com/photos/35157692/pexels-photo-35157692.jpeg?auto=compress&cs=tinysrgb&w=1200'
    end,
    bio = 'Perfil de demonstração. Substituir nome, fotografia e biografia pelos dados reais da equipa antes da divulgação.',
    years_experience = case rb.slug when 'magoanine-c' then 7 when 'oryon' then 6 else 5 end,
    rating_avg = coalesce((select avg(r.rating)::numeric(3,2) from public.reviews r where r.barber_id = br.id and r.is_published), 0),
    rating_count = coalesce((select count(*)::integer from public.reviews r where r.barber_id = br.id and r.is_published), 0),
    is_active = true,
    sort_order = 0
from ranked_barbers rb
where br.id = rb.id and rb.rn = 1;

insert into public.barbers (barbershop_id, display_name, photo_url, bio, years_experience, rating_avg, rating_count, is_active, sort_order)
select sh.id, v.display_name, v.photo_url,
       'Perfil de demonstração. Substituir nome, fotografia e biografia pelos dados reais da equipa antes da divulgação.',
       v.years_experience, 0, 0, true, 0
from public.barbershops sh
join (values
  ('magoanine-c'::text, 'Dércio Mucavele'::text, 'https://images.pexels.com/photos/7389079/pexels-photo-7389079.jpeg?auto=compress&cs=tinysrgb&w=1200'::text, 7),
  ('oryon'::text, 'Edson Mucavele'::text, 'https://images.pexels.com/photos/17086220/pexels-photo-17086220.jpeg?auto=compress&cs=tinysrgb&w=1200'::text, 6),
  ('maputo-matola'::text, 'Celso Nhantumbo'::text, 'https://images.pexels.com/photos/35157692/pexels-photo-35157692.jpeg?auto=compress&cs=tinysrgb&w=1200'::text, 5)
) v(slug, display_name, photo_url, years_experience) on v.slug = sh.slug
where not exists (select 1 from public.barbers existing where existing.barbershop_id = sh.id);

insert into public.barber_services (barber_id, service_id)
select br.id, s.id
from public.barbers br
join public.services s on s.barbershop_id = br.barbershop_id and s.is_active
where br.is_active
on conflict do nothing;

-- Fictional demo profiles; the copy explicitly marks the data as illustrative.
update public.barbershops
set name = 'Mufundisse Barber House',
    description = 'Perfil de demonstração • Barbearia fictícia em Magoanine C, Maputo. A fachada e os contactos são ilustrativos; substituir pelos dados reais antes da divulgação.',
    logo_url = 'https://raw.githubusercontent.com/edmundokutuzov333/BarberOS/79c8736446f390356334a658ee21fac86cef9ade/frontend/public/brand-assets/mufundisse-barber-house.svg',
    cover_url = 'https://images.pexels.com/photos/11513688/pexels-photo-11513688.jpeg?auto=compress&cs=tinysrgb&w=1600',
    phone = '+258840000001',
    whatsapp = '+258840000001',
    instagram = 'mufundisse.barber.demo',
    address = 'Magoanine C, via principal, Cidade de Maputo',
    maps_url = 'https://www.google.com/maps/search/?api=1&query=Magoanine+C%2C+Maputo%2C+Mozambique',
    lat = -25.829, lng = 32.572, timezone = 'Africa/Maputo'
where slug = 'magoanine-c';

update public.barbershops
set name = 'Oryon Barber Studio',
    description = 'Perfil de demonstração • Estúdio de grooming fictício na zona de Sommerschield, Maputo. A fachada, a equipa e os contactos são ilustrativos; substituir pelos dados reais antes da divulgação.',
    logo_url = 'https://raw.githubusercontent.com/edmundokutuzov333/BarberOS/79c8736446f390356334a658ee21fac86cef9ade/frontend/public/brand-assets/oryon-barber-studio.svg',
    cover_url = 'https://images.pexels.com/photos/27520668/pexels-photo-27520668.jpeg?auto=compress&cs=tinysrgb&w=1600',
    phone = '+258850000002',
    whatsapp = '+258850000002',
    instagram = 'oryon.barber.demo',
    address = 'Avenida Julius Nyerere, zona de Sommerschield, Maputo',
    maps_url = 'https://www.google.com/maps/search/?api=1&query=Avenida+Julius+Nyerere%2C+Sommerschield%2C+Maputo%2C+Mozambique',
    lat = -25.969, lng = 32.600, timezone = 'Africa/Maputo'
where slug = 'oryon';

update public.barbershops
set name = 'Matola Prime Barber',
    description = 'Perfil de demonstração • Barbearia fictícia na Matola Cidade. A fachada, a equipa e os contactos são ilustrativos; substituir pelos dados reais antes da divulgação.',
    logo_url = 'https://raw.githubusercontent.com/edmundokutuzov333/BarberOS/79c8736446f390356334a658ee21fac86cef9ade/frontend/public/brand-assets/matola-prime-barber.svg',
    cover_url = 'https://images.pexels.com/photos/11703458/pexels-photo-11703458.jpeg?auto=compress&cs=tinysrgb&w=1600',
    phone = '+258860000003',
    whatsapp = '+258860000003',
    instagram = 'matolaprime.barber.demo',
    address = 'Avenida Samora Machel, Matola Cidade, Província de Maputo',
    maps_url = 'https://www.google.com/maps/search/?api=1&query=Avenida+Samora+Machel%2C+Matola%2C+Mozambique',
    lat = -25.962, lng = 32.458, timezone = 'Africa/Maputo'
where slug = 'maputo-matola';

-- Standard demo hours: Monday–Saturday 09:00–19:00, Sunday closed.
update public.working_hours
set opens_at = '09:00', closes_at = '19:00', is_closed = (weekday = 0)
where barber_id is null
  and barbershop_id in (select id from public.barbershops where slug in ('magoanine-c', 'oryon', 'maputo-matola'));

drop table pg_temp.default_haircut_catalog;
