-- Server-only boundary for the encrypted Groq credential. No credential is stored in source.
create extension if not exists supabase_vault with schema vault;
create or replace function public.get_intelligence_cloud_config()
returns jsonb
language sql stable security definer set search_path = ''
as $$
 select case when exists(select 1 from vault.decrypted_secrets where name='barberos_intelligence_groq_free' and decrypted_secret='true')
 then (select jsonb_build_object('key',decrypted_secret,'free_confirmed',true) from vault.decrypted_secrets where name='barberos_intelligence_groq_key' and length(decrypted_secret)>20 limit 1)
 else null end;
$$;
revoke all on function public.get_intelligence_cloud_config() from public, anon, authenticated;
grant execute on function public.get_intelligence_cloud_config() to service_role;
comment on function public.get_intelligence_cloud_config() is 'Service-role-only encrypted Groq configuration; never called by the browser.';