-- Add service photography and enrich existing Mozambique-market shop profiles.
alter table public.services add column if not exists photo_url text;

-- Extend the public booking payload to expose only the service's public image URL.
CREATE OR REPLACE FUNCTION public.get_public_barbershop(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sh public.barbershops%rowtype;
  v_payload jsonb;
begin
  if p_slug is null or btrim(p_slug) = '' then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select *
  into sh
  from public.barbershops
  where slug=btrim(p_slug)
    and status in ('active','trial')
  limit 1;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'shop', jsonb_build_object(
      'name', sh.name,
      'slug', sh.slug,
      'description', sh.description,
      'logo_url', sh.logo_url,
      'cover_url', sh.cover_url,
      'theme_key', sh.theme_key,
      'phone', sh.phone,
      'whatsapp', sh.whatsapp,
      'instagram', sh.instagram,
      'address', sh.address,
      'maps_url', sh.maps_url,
      'lat', sh.lat,
      'lng', sh.lng,
      'timezone', sh.timezone,
      'status', sh.status,
      'deposit_enabled', sh.deposit_enabled,
      'deposit_mode', sh.deposit_mode,
      'deposit_value', sh.deposit_value,
      'deposit_hold_min', sh.deposit_hold_min,
      'slot_interval_min', sh.slot_interval_min,
      'min_lead_time_min', sh.min_lead_time_min,
      'max_advance_days', sh.max_advance_days,
      'cancellation_rule', sh.cancellation_rule
    ),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'price_cents', s.price_cents,
          'duration_min', s.duration_min,
          'requires_deposit', s.requires_deposit,
          'photo_url', s.photo_url
        )
        order by s.sort_order, s.name
      )
      from public.services s
      where s.barbershop_id=sh.id
        and s.is_active
    ), '[]'::jsonb),
    'haircuts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'service_id', h.service_id,
          'name', h.name,
          'description', h.description,
          'photo_url', h.photo_url,
          'price_cents', h.price_cents,
          'duration_min', h.duration_min
        )
        order by h.sort_order, h.name
      )
      from public.haircuts h
      where h.barbershop_id=sh.id
        and h.is_active
    ), '[]'::jsonb),
    'barbers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'display_name', b.display_name,
          'photo_url', b.photo_url,
          'bio', b.bio,
          'years_experience', b.years_experience,
          'rating_avg', b.rating_avg,
          'rating_count', b.rating_count,
          'service_ids', coalesce((
            select jsonb_agg(bs.service_id order by bs.service_id)
            from public.barber_services bs
            where bs.barber_id=b.id
          ), '[]'::jsonb)
        )
        order by b.sort_order, b.display_name
      )
      from public.barbers b
      where b.barbershop_id=sh.id
        and b.is_active
    ), '[]'::jsonb),
    'working_hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', wh.weekday,
          'opens_at', wh.opens_at,
          'closes_at', wh.closes_at,
          'is_closed', wh.is_closed
        )
        order by wh.weekday
      )
      from public.working_hours wh
      where wh.barbershop_id=sh.id
        and wh.barber_id is null
    ), '[]'::jsonb),
    'reviews', jsonb_build_object(
      'rating_avg', coalesce((
        select round(avg(r.rating)::numeric,2)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),0),
      'rating_count', (
        select count(*)
        from public.reviews r
        where r.barbershop_id=sh.id
          and r.is_published
      ),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'rating', r.rating,
            'comment', r.comment,
            'created_at', r.created_at
          )
          order by r.created_at desc
        )
        from (
          select rating,comment,created_at
          from public.reviews
          where barbershop_id=sh.id
            and is_published
          order by created_at desc
          limit 6
        ) r
      ), '[]'::jsonb)
    )
  )
  into v_payload;

  return v_payload;
end;
$function$;

update public.haircuts as h set photo_url = case lower(btrim(h.name))
  when 'low fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-low-fade'
  when 'mid fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-mid-fade'
  when 'high fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-high-fade'
  when 'taper fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-taper-fade'
  when 'skin fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-skin-fade'
  when 'drop fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-drop-fade'
  when 'burst fade' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-burst-fade'
  when 'buzz cut' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-buzz-cut'
  when 'crew cut' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-crew-cut'
  when 'caesar' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-caesar'
  when 'french crop' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-french-crop'
  when 'pompadour' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-pompadour'
  when 'quiff' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-quiff'
  when 'slick back' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-slick-back'
  when 'afro shape-up' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-afro-shape-up'
  when 'waves' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-waves'
  when 'twists' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-twists'
  when 'dreads retwist' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-dreads-retwist'
  when 'corte à tesoura' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-corte-a-tesoura'
  when 'corte infantil' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-corte-infantil'
  when 'design freestyle' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-design-freestyle'
  when 'careca à navalha' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=haircut-careca-a-navalha'
  else h.photo_url
end
from public.barbershops as sh where h.barbershop_id=sh.id and sh.slug in ('magoanine-c','oryon','maputo-matola')
and lower(btrim(h.name)) in ('low fade', 'mid fade', 'high fade', 'taper fade', 'skin fade', 'drop fade', 'burst fade', 'buzz cut', 'crew cut', 'caesar', 'french crop', 'pompadour', 'quiff', 'slick back', 'afro shape-up', 'waves', 'twists', 'dreads retwist', 'corte à tesoura', 'corte infantil', 'design freestyle', 'careca à navalha');

update public.services as s set photo_url = case lower(btrim(s.name))
  when 'corte clássico' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=service-corte-classico'
  when 'corte + barba' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=service-corte-barba'
  when 'barba e acabamento' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=service-barba-completa'
  when 'corte infantil' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=service-corte-infantil'
  else s.photo_url end
from public.barbershops sh where s.barbershop_id=sh.id and sh.slug in ('magoanine-c','oryon','maputo-matola');

insert into public.services (barbershop_id, name, price_cents, duration_min, requires_deposit, is_active, sort_order, photo_url)
select sh.id,v.name,v.price_cents,v.duration_min,false,true,v.sort_order,'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=' || v.photo_asset
from public.barbershops sh cross join (values
  ('Degradê / Fade'::text, 30000::int, 40::int, 'service-degrade'::text, 5::int),
  ('Contorno / Line-up'::text, 10000::int, 15::int, 'service-design-sobrancelha'::text, 6::int),
  ('Corte à tesoura'::text, 35000::int, 45::int, 'service-corte-tesoura'::text, 7::int),
  ('Lavagem e finalização'::text, 12000::int, 20::int, 'service-lavagem'::text, 8::int),
  ('Coloração capilar'::text, 45000::int, 60::int, 'service-coloracao'::text, 9::int),
  ('Design de sobrancelhas'::text, 8000::int, 10::int, 'service-design-sobrancelha'::text, 10::int),
  ('Corte Premium + Barba'::text, 55000::int, 70::int, 'service-corte-premium'::text, 11::int),
  ('Tratamento capilar'::text, 30000::int, 40::int, 'service-tratamento-capilar'::text, 12::int),
  ('Raspagem à navalha'::text, 15000::int, 20::int, 'service-barba-completa'::text, 13::int),
  ('Waves e escova'::text, 25000::int, 30::int, 'service-waves'::text, 14::int),
  ('Manutenção de dreads e twists'::text, 35000::int, 45::int, 'service-dreads-retwist'::text, 15::int)
) as v(name,price_cents,duration_min,photo_asset,sort_order)
where sh.slug in ('magoanine-c','oryon','maputo-matola') and not exists (select 1 from public.services e where e.barbershop_id=sh.id and lower(btrim(e.name))=lower(btrim(v.name)));

update public.services as s set photo_url='https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=' || v.photo_asset,price_cents=v.price_cents,duration_min=v.duration_min,is_active=true,sort_order=v.sort_order
from public.barbershops sh cross join (values
  ('Degradê / Fade'::text, 30000::int, 40::int, 'service-degrade'::text, 5::int),
  ('Contorno / Line-up'::text, 10000::int, 15::int, 'service-design-sobrancelha'::text, 6::int),
  ('Corte à tesoura'::text, 35000::int, 45::int, 'service-corte-tesoura'::text, 7::int),
  ('Lavagem e finalização'::text, 12000::int, 20::int, 'service-lavagem'::text, 8::int),
  ('Coloração capilar'::text, 45000::int, 60::int, 'service-coloracao'::text, 9::int),
  ('Design de sobrancelhas'::text, 8000::int, 10::int, 'service-design-sobrancelha'::text, 10::int),
  ('Corte Premium + Barba'::text, 55000::int, 70::int, 'service-corte-premium'::text, 11::int),
  ('Tratamento capilar'::text, 30000::int, 40::int, 'service-tratamento-capilar'::text, 12::int),
  ('Raspagem à navalha'::text, 15000::int, 20::int, 'service-barba-completa'::text, 13::int),
  ('Waves e escova'::text, 25000::int, 30::int, 'service-waves'::text, 14::int),
  ('Manutenção de dreads e twists'::text, 35000::int, 45::int, 'service-dreads-retwist'::text, 15::int)
) as v(name,price_cents,duration_min,photo_asset,sort_order)
where s.barbershop_id=sh.id and sh.slug in ('magoanine-c','oryon','maputo-matola') and lower(btrim(s.name))=lower(btrim(v.name));

update public.barbers b set is_active=false from public.barbershops sh where b.barbershop_id=sh.id and sh.slug in ('magoanine-c','oryon','maputo-matola');

with staff(slug,display_name,photo_asset,bio,years_experience,sort_order) as (values
  ('magoanine-c'::text, 'Dércio Mucavele'::text, 'barber-magoanine-1'::text, 'Especialista em degradês, contornos precisos e acabamento de barba. Trabalha com atenção à simetria e ao estilo de cada cliente.'::text, 7::int, 1::int),
  ('magoanine-c'::text, 'Alberto Chongo'::text, 'barber-magoanine-2'::text, 'Focado em cortes modernos, acabamento de linha e transições limpas, com atenção ao detalhe.'::text, 6::int, 2::int),
  ('magoanine-c'::text, 'Nelson Mabote'::text, 'barber-magoanine-3'::text, 'Experiência em cortes para cabelo crespo, shape-up e manutenção de estilos naturais.'::text, 5::int, 3::int),
  ('magoanine-c'::text, 'Lázaro Cossa'::text, 'barber-magoanine-4'::text, 'Dedicado à tesoura, barba e finalização, adaptando o corte ao formato do rosto.'::text, 4::int, 4::int),
  ('maputo-matola'::text, 'Celso Nhantumbo'::text, 'barber-matola-1'::text, 'Focado em cortes clássicos e degradês equilibrados, com acabamento cuidado para o dia-a-dia.'::text, 5::int, 1::int),
  ('maputo-matola'::text, 'Mateus Macuácua'::text, 'barber-matola-2'::text, 'Especialista em cortes à tesoura, textura e finalização de estilos curtos e médios.'::text, 7::int, 2::int),
  ('maputo-matola'::text, 'Yassine Abdala'::text, 'barber-matola-3'::text, 'Trabalha com cortes contemporâneos, penteados estruturados e aconselhamento de estilo.'::text, 6::int, 3::int),
  ('maputo-matola'::text, 'Mário Simango'::text, 'barber-matola-4'::text, 'Focado em barba, contornos e cortes de manutenção com acabamento limpo.'::text, 4::int, 4::int),
  ('oryon'::text, 'Edson Mucavele'::text, 'barber-oryon-1'::text, 'Focado em cortes actuais, textura e consultoria de estilo, com atenção à proporção e ao acabamento.'::text, 6::int, 1::int),
  ('oryon'::text, 'Joel Manjate'::text, 'barber-oryon-2'::text, 'Especialista em cabelo crespo, waves, twists e manutenção de estilos naturais.'::text, 5::int, 2::int),
  ('oryon'::text, 'Tomás Langa'::text, 'barber-oryon-3'::text, 'Experiência em cortes clássicos, trabalho de tesoura e penteados com volume.'::text, 8::int, 3::int),
  ('oryon'::text, 'Kelvin Cossa'::text, 'barber-oryon-4'::text, 'Focado em degradês, alinhamento da linha frontal e acabamento de barba.'::text, 4::int, 4::int)
)
update public.barbers b set photo_url='https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=' || staff.photo_asset,bio=staff.bio,years_experience=staff.years_experience,sort_order=staff.sort_order,is_active=true,rating_avg=0,rating_count=0
from public.barbershops sh join staff on staff.slug=sh.slug where b.barbershop_id=sh.id and lower(btrim(b.display_name))=lower(btrim(staff.display_name));

with staff(slug,display_name,photo_asset,bio,years_experience,sort_order) as (values
  ('magoanine-c'::text, 'Dércio Mucavele'::text, 'barber-magoanine-1'::text, 'Especialista em degradês, contornos precisos e acabamento de barba. Trabalha com atenção à simetria e ao estilo de cada cliente.'::text, 7::int, 1::int),
  ('magoanine-c'::text, 'Alberto Chongo'::text, 'barber-magoanine-2'::text, 'Focado em cortes modernos, acabamento de linha e transições limpas, com atenção ao detalhe.'::text, 6::int, 2::int),
  ('magoanine-c'::text, 'Nelson Mabote'::text, 'barber-magoanine-3'::text, 'Experiência em cortes para cabelo crespo, shape-up e manutenção de estilos naturais.'::text, 5::int, 3::int),
  ('magoanine-c'::text, 'Lázaro Cossa'::text, 'barber-magoanine-4'::text, 'Dedicado à tesoura, barba e finalização, adaptando o corte ao formato do rosto.'::text, 4::int, 4::int),
  ('maputo-matola'::text, 'Celso Nhantumbo'::text, 'barber-matola-1'::text, 'Focado em cortes clássicos e degradês equilibrados, com acabamento cuidado para o dia-a-dia.'::text, 5::int, 1::int),
  ('maputo-matola'::text, 'Mateus Macuácua'::text, 'barber-matola-2'::text, 'Especialista em cortes à tesoura, textura e finalização de estilos curtos e médios.'::text, 7::int, 2::int),
  ('maputo-matola'::text, 'Yassine Abdala'::text, 'barber-matola-3'::text, 'Trabalha com cortes contemporâneos, penteados estruturados e aconselhamento de estilo.'::text, 6::int, 3::int),
  ('maputo-matola'::text, 'Mário Simango'::text, 'barber-matola-4'::text, 'Focado em barba, contornos e cortes de manutenção com acabamento limpo.'::text, 4::int, 4::int),
  ('oryon'::text, 'Edson Mucavele'::text, 'barber-oryon-1'::text, 'Focado em cortes actuais, textura e consultoria de estilo, com atenção à proporção e ao acabamento.'::text, 6::int, 1::int),
  ('oryon'::text, 'Joel Manjate'::text, 'barber-oryon-2'::text, 'Especialista em cabelo crespo, waves, twists e manutenção de estilos naturais.'::text, 5::int, 2::int),
  ('oryon'::text, 'Tomás Langa'::text, 'barber-oryon-3'::text, 'Experiência em cortes clássicos, trabalho de tesoura e penteados com volume.'::text, 8::int, 3::int),
  ('oryon'::text, 'Kelvin Cossa'::text, 'barber-oryon-4'::text, 'Focado em degradês, alinhamento da linha frontal e acabamento de barba.'::text, 4::int, 4::int)
)
insert into public.barbers (barbershop_id,display_name,photo_url,bio,years_experience,rating_avg,rating_count,is_active,sort_order)
select sh.id,staff.display_name,'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=' || staff.photo_asset,staff.bio,staff.years_experience,0,0,true,staff.sort_order
from public.barbershops sh join staff on staff.slug=sh.slug
where not exists (select 1 from public.barbers e where e.barbershop_id=sh.id and lower(btrim(e.display_name))=lower(btrim(staff.display_name)));

insert into public.barber_services (barber_id,service_id)
select b.id,s.id from public.barbers b join public.services s on s.barbershop_id=b.barbershop_id and s.is_active join public.barbershops sh on sh.id=b.barbershop_id
where sh.slug in ('magoanine-c','oryon','maputo-matola') and b.is_active on conflict (barber_id,service_id) do nothing;

-- Historical first pass contained a false join here; the following repair migration fills these rows.
insert into public.working_hours (barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed)
select sh.id,b.id,wh.weekday,wh.opens_at,wh.closes_at,wh.is_closed
from public.working_hours wh join public.barbershop_members bm on false join public.barbers b on b.barbershop_id=wh.barbershop_id and b.is_active join public.barbershops sh on sh.id=b.barbershop_id
where wh.barber_id is null and sh.slug in ('magoanine-c','oryon','maputo-matola')
and not exists (select 1 from public.working_hours e where e.barbershop_id=sh.id and e.barber_id=b.id and e.weekday=wh.weekday);

update public.barbershops set
logo_url=case slug when 'magoanine-c' then '/brand-assets/mufundisse-barber-house.svg' when 'oryon' then '/brand-assets/oryon-barber-studio.svg' when 'maputo-matola' then '/brand-assets/matola-prime-barber.svg' else logo_url end,
cover_url=case slug when 'magoanine-c' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=shop-magoanine' when 'oryon' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=shop-oryon' when 'maputo-matola' then 'https://alseiinjzwjdiwtvkdzy.supabase.co/functions/v1/barber-assets?asset=shop-matola' else cover_url end
where slug in ('magoanine-c','oryon','maputo-matola');