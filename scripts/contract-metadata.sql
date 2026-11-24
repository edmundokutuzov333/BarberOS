-- Read-only catalog capture. No account/customer rows or secret values.
select jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name',p.proname,
      'returns',pg_get_function_result(p.oid),
      'identity_arguments',pg_get_function_identity_arguments(p.oid),
      'input_arguments',case when p.proargmodes is null then to_jsonb(p.proargnames)
        else to_jsonb(array(select a.name from unnest(p.proargnames,p.proargmodes) a(name,mode)
          where a.mode in ('i','b','v'))) end,
      'required_argument_count',p.pronargs-p.pronargdefaults,
      'definition_md5',md5(pg_get_functiondef(p.oid)),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
    ) order by p.proname,pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and not exists(select 1 from pg_depend d
        where d.objid=p.oid and d.classid='pg_proc'::regclass and d.deptype='e')
  )
) inventory;
