-- Read-only structural inventory. No rows, credentials or function bodies are returned.
-- Run identically against the isolated database, staging and production.
select jsonb_build_object(
  'tables', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)
    order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')), '[]'::jsonb),
  'columns', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'table',c.relname,'name',a.attname,
    'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
    'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
    order by n.nspname,c.relname,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname in ('public','private') and c.relkind in ('r','p')
      and a.attnum>0 and not a.attisdropped), '[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid))
    order by n.nspname,c.relname,x.conname)
    from pg_constraint x join pg_class c on c.oid=x.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private')), '[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',schemaname,'table',tablename,'name',indexname,'definition',indexdef)
    order by schemaname,tablename,indexname) from pg_indexes
    where schemaname in ('public','private')), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'returns',pg_get_function_result(p.oid),'definer',p.prosecdef,
    'configuration',p.proconfig,'acl',p.proacl::text,'definition_md5',md5(pg_get_functiondef(p.oid)))
    order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f'
      and not exists(select 1 from pg_depend dep where dep.classid='pg_proc'::regclass
        and dep.objid=p.oid and dep.deptype='e')), '[]'::jsonb),
  'policies', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',schemaname,'table',tablename,'name',policyname,'roles',roles,
    'command',cmd,'permissive',permissive,'using',qual,'check',with_check)
    order by schemaname,tablename,policyname) from pg_policies
    where schemaname in ('public','private')), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),
    'enabled',t.tgenabled) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and not t.tgisinternal), '[]'::jsonb),
  'views', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',c.relname,'options',c.reloptions,
    'definition_md5',md5(pg_get_viewdef(c.oid))) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('v','m')), '[]'::jsonb),
  'enums', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'name',t.typname,'label',e.enumlabel,'order',e.enumsortorder)
    order by n.nspname,t.typname,e.enumsortorder)
    from pg_enum e join pg_type t on t.oid=e.enumtypid
    join pg_namespace n on n.oid=t.typnamespace where n.nspname in ('public','private')), '[]'::jsonb),
  'grants', coalesce((select jsonb_agg(jsonb_build_object(
    'schema',table_schema,'table',table_name,'role',grantee,'privilege',privilege_type)
    order by table_schema,table_name,grantee,privilege_type)
    from information_schema.role_table_grants
    where table_schema in ('public','private') and grantee in ('anon','authenticated','service_role','PUBLIC')), '[]'::jsonb),
  'extensions', coalesce((select jsonb_agg(jsonb_build_object(
    'name',e.extname,'schema',n.nspname,'version',e.extversion) order by e.extname)
    from pg_extension e join pg_namespace n on n.oid=e.extnamespace), '[]'::jsonb)
) as schema_manifest;
