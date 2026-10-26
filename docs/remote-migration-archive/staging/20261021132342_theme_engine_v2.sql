-- Theme Engine v2: validar e normalizar a chave do tema.
-- O frontend v2 resolve as chaves legadas durante a transição.
-- Lista sincronizada com frontend/src/themes/registry.ts.

-- Cópia para rollback manual. A staging foi verificada sem barbearias neste momento.
create table if not exists public._theme_key_backup_20261020 as
  select id, theme_key, now() as backed_up_at from public.barbershops;
alter table public._theme_key_backup_20261020 enable row level security;
revoke all on public._theme_key_backup_20261020 from anon, authenticated;

update public.barbershops set theme_key = case theme_key
    when 'noir-brass'      then 'speakeasy'
    when 'violet-noir'     then 'neon'
    when 'neon-lilac'      then 'neon'
    when 'plum-ember'      then 'neon'
    when 'rose-quartz'     then 'neon'
    when 'midnight-indigo' then 'navalha'
    when 'cyan-abyss'      then 'navalha'
    when 'nordic-mono'     then 'navalha'
    when 'emerald-smoke'   then 'capulana'
    when 'amber-ash'       then 'faroeste'
    when 'blood-orange'    then 'ink'
  end
where theme_key in ('noir-brass','violet-noir','neon-lilac','plum-ember','rose-quartz','midnight-indigo',
                    'cyan-abyss','nordic-mono','emerald-smoke','amber-ash','blood-orange');

update public.barbershops set theme_key = 'speakeasy'
where theme_key is null
   or theme_key not in ('speakeasy','poste','boticario','degrade','navalha','ink','faroeste','capulana','neon','atelier');

alter table public.barbershops alter column theme_key set default 'speakeasy';
alter table public.barbershops alter column theme_key set not null;
alter table public.barbershops drop constraint if exists barbershops_theme_key_check;
alter table public.barbershops add constraint barbershops_theme_key_check
  check (theme_key in ('speakeasy','poste','boticario','degrade','navalha','ink','faroeste','capulana','neon','atelier'));

comment on column public.barbershops.theme_key is
  'Chave do tema visual (Theme Engine v2). Lista canónica em frontend/src/themes/registry.ts; nova chave = nova migração que substitui este CHECK.';