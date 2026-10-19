-- Correct two catalogue images that were not a close visual match for their named cuts.
-- Keep shop-uploaded photos intact; only update the known demo defaults.
update public.haircuts as h
set photo_url = case
  when lower(btrim(h.name)) = 'design freestyle'
    then 'https://images.pexels.com/photos/37339534/pexels-photo-37339534.jpeg?auto=compress&cs=tinysrgb&w=1200'
  when lower(btrim(h.name)) = 'careca à navalha'
    then 'https://images.pexels.com/photos/12464838/pexels-photo-12464838.jpeg?auto=compress&cs=tinysrgb&w=1200'
  else h.photo_url
end
where (
    lower(btrim(h.name)) = 'design freestyle'
    and (
      nullif(btrim(h.photo_url), '') is null
      or h.photo_url like '%35276951%'
    )
  )
  or (
    lower(btrim(h.name)) = 'careca à navalha'
    and (
      nullif(btrim(h.photo_url), '') is null
      or h.photo_url like '%17492272%'
    )
  );

-- Enrich only the known fictitious demo copy. Do not overwrite a shop owner's later edits.
update public.barbershops
set description = case slug
  when 'magoanine-c' then 'Perfil de demonstração • Barbearia fictícia em Magoanine C, Maputo, com degradês limpos, corte clássico, acabamento de barba e atendimento por marcação. A fachada, a equipa, os contactos e a morada são ilustrativos; substituir pelos dados reais antes da divulgação.'
  when 'oryon' then 'Perfil de demonstração • Estúdio fictício de grooming em Sommerschield, Maputo, com cortes modernos, consultoria de estilo, finalização e cuidado da barba. A fachada, a equipa, os contactos e a morada são ilustrativos; substituir pelos dados reais antes da divulgação.'
  when 'maputo-matola' then 'Perfil de demonstração • Barbearia fictícia na Matola Cidade, com cortes clássicos, degradês, corte infantil e acabamento de barba. A fachada, a equipa, os contactos e a morada são ilustrativos; substituir pelos dados reais antes da divulgação.'
  else description
end
where slug in ('magoanine-c', 'oryon', 'maputo-matola')
  and description like 'Perfil de demonstração%';

update public.barbers as b
set bio = case s.slug
  when 'magoanine-c' then 'Barbeiro de demonstração especializado em low fade, mid fade, contornos precisos e acabamento de barba. Perfil fictício para apresentar o catálogo; substituir pela biografia real antes da divulgação.'
  when 'oryon' then 'Barbeiro de demonstração com foco em cortes modernos, tesoura, finalização e aconselhamento de estilo. Perfil fictício para apresentar o estúdio; substituir pela biografia real antes da divulgação.'
  when 'maputo-matola' then 'Barbeiro de demonstração focado em cortes clássicos, degradês e acabamentos limpos para o dia-a-dia. Perfil fictício para apresentar a equipa; substituir pela biografia real antes da divulgação.'
  else b.bio
end
from public.barbershops as s
where b.barbershop_id = s.id
  and s.slug in ('magoanine-c', 'oryon', 'maputo-matola')
  and b.bio like 'Perfil de demonstração. Substituir nome%';
