-- Complete missing public shop presentation fields without overwriting shop-owned data.
-- Fictional fallback values are clearly labelled and must be replaced before a shop is promoted as verified.
update public.barbershops b
set
  logo_url = coalesce(nullif(btrim(b.logo_url), ''), 'https://barber-os-orpin.vercel.app/brand-assets/barberos-default.svg'),
  cover_url = coalesce(nullif(btrim(b.cover_url), ''), case (abs(hashtext(b.id::text)) % 4)
    when 0 then 'https://images.pexels.com/photos/11513688/pexels-photo-11513688.jpeg?auto=compress&cs=tinysrgb&w=1600'
    when 1 then 'https://images.pexels.com/photos/27520668/pexels-photo-27520668.jpeg?auto=compress&cs=tinysrgb&w=1600'
    when 2 then 'https://images.pexels.com/photos/11703458/pexels-photo-11703458.jpeg?auto=compress&cs=tinysrgb&w=1600'
    else 'https://images.pexels.com/photos/7697319/pexels-photo-7697319.jpeg?auto=compress&cs=tinysrgb&w=1600'
  end),
  description = coalesce(nullif(btrim(b.description), ''), 'Perfil de demonstração fictício em Moçambique. Endereço, contactos e imagens são ilustrativos; a barbearia deve confirmar e substituir estes dados antes de os divulgar como reais.'),
  phone = coalesce(nullif(btrim(b.phone), ''), '+25884' || lpad((abs(hashtext(b.id::text)) % 10000000)::text, 7, '0')),
  whatsapp = coalesce(nullif(btrim(b.whatsapp), ''), nullif(btrim(b.phone), ''), '+25884' || lpad((abs(hashtext(b.id::text)) % 10000000)::text, 7, '0')),
  address = coalesce(nullif(btrim(b.address), ''), 'Maputo, Moçambique — localização de demonstração'),
  maps_url = coalesce(nullif(btrim(b.maps_url), ''), 'https://www.google.com/maps/search/?api=1&query=Maputo%2C+Mozambique'),
  lat = coalesce(b.lat, -25.9692),
  lng = coalesce(b.lng, 32.5732),
  timezone = coalesce(nullif(btrim(b.timezone), ''), 'Africa/Maputo'),
  instagram = coalesce(nullif(btrim(b.instagram), ''), 'barbearia.demo.' || left(regexp_replace(lower(b.slug), '[^a-z0-9]+', '.', 'g'), 24))
where
  nullif(btrim(b.logo_url), '') is null
  or nullif(btrim(b.cover_url), '') is null
  or nullif(btrim(b.description), '') is null
  or nullif(btrim(b.phone), '') is null
  or nullif(btrim(b.whatsapp), '') is null
  or nullif(btrim(b.address), '') is null
  or nullif(btrim(b.maps_url), '') is null
  or b.lat is null or b.lng is null
  or nullif(btrim(b.timezone), '') is null
  or nullif(btrim(b.instagram), '') is null;

comment on column public.barbershops.logo_url is 'Logótipo público; fallback BarberOS usado apenas quando não existe imagem da barbearia.';
comment on column public.barbershops.cover_url is 'Fotografia de capa; a imagem padrão de referência deve ser substituída por uma fotografia real do estabelecimento.';
