begin;
do $qa$ begin
 if has_function_privilege('anon','public.get_intelligence_cloud_config()','execute') or has_function_privilege('authenticated','public.get_intelligence_cloud_config()','execute') or not has_function_privilege('service_role','public.get_intelligence_cloud_config()','execute') then raise exception 'INTELLIGENCE_CREDENTIAL_PRIVILEGE_FAILED'; end if;
end $qa$;
rollback;
