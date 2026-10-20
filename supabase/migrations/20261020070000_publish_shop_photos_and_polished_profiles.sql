-- Make public shop photography reliable on the deployed Vercel origin and polish public profile copy.
-- Preserve each shop's distinct stock-photo cover; these are representative reference images, not proof of the named venue.
update public.barbershops
set
  logo_url = case slug
    when 'magoanine-c' then '/brand-assets/mufundisse-barber-house.svg'
    when 'oryon' then '/brand-assets/oryon-barber-studio.svg'
    when 'maputo-matola' then '/brand-assets/matola-prime-barber.svg'
    else logo_url
  end,
  cover_url = case slug
    when 'magoanine-c' then 'https://images.pexels.com/photos/11513688/pexels-photo-11513688.jpeg?auto=compress&cs=tinysrgb&w=1600'
    when 'oryon' then 'https://images.pexels.com/photos/27520668/pexels-photo-27520668.jpeg?auto=compress&cs=tinysrgb&w=1600'
    when 'maputo-matola' then 'https://images.pexels.com/photos/11703458/pexels-photo-11703458.jpeg?auto=compress&cs=tinysrgb&w=1600'
    else cover_url
  end,
  description = case slug
    when 'magoanine-c' then 'Na Mufundisse Barber House, em Magoanine C, Maputo, encontra cortes clássicos, degradês bem definidos, acabamento de barba e opções para crianças. Atendimento cuidado e marcação simples, com foco no conforto e na consistência do resultado.'
    when 'oryon' then 'Oryon Barber Studio, em Sommerschield, Maputo, combina cortes contemporâneos, consultoria de estilo, finalização e cuidado da barba num serviço pensado ao detalhe. Explore os serviços e escolha o horário que melhor se adapta ao seu dia.'
    when 'maputo-matola' then 'A Matola Prime Barber, na Matola Cidade, reúne cortes clássicos, degradês, corte infantil e serviços de barba. Um espaço orientado para um acabamento limpo, atendimento organizado e marcações sem complicações.'
    else description
  end
where slug in ('magoanine-c', 'oryon', 'maputo-matola');

update public.barbers as b
set bio = case sh.slug
  when 'magoanine-c' then 'Especialista em low fade, mid fade, contornos precisos e acabamento de barba. Trabalha com atenção à simetria, ao detalhe e ao estilo que melhor se adapta a cada cliente.'
  when 'oryon' then 'Focado em cortes modernos, trabalho de tesoura, finalização e aconselhamento de estilo. Combina técnica e detalhe para encontrar um acabamento alinhado com a preferência de cada cliente.'
  when 'maputo-matola' then 'Focado em cortes clássicos, degradês e acabamentos limpos para o dia-a-dia. Dá prioridade a um resultado equilibrado, adaptado ao formato do rosto e à preferência de cada cliente.'
  else b.bio
end
from public.barbershops as sh
where b.barbershop_id = sh.id
  and sh.slug in ('magoanine-c', 'oryon', 'maputo-matola')
  and (b.bio ilike '%demonstração%' or b.bio ilike '%fictício%' or b.bio ilike '%fictícia%');
