-- Repair stale policy dependencies without changing policy roles, commands or predicates.
do $repair$
declare pol record; qual text; check_expr text; ddl text;
begin
 perform set_config('search_path','',true);
 for pol in
 select c.relname,p.polname,pg_get_expr(p.polqual,p.polrelid) as qual,pg_get_expr(p.polwithcheck,p.polrelid) as check_expr
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and exists(
 select 1 from pg_depend d join pg_proc f on f.oid=d.refobjid join pg_namespace fn on fn.oid=f.pronamespace
 where d.classid='pg_policy'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass
 and fn.nspname='public' and f.proname in ('is_member','is_platform_admin'))
 loop
 qual:=replace(replace(pol.qual,'public.is_member(','private.is_member('),'public.is_platform_admin(','private.is_platform_admin(');
 check_expr:=replace(replace(pol.check_expr,'public.is_member(','private.is_member('),'public.is_platform_admin(','private.is_platform_admin(');
 if qual is not distinct from pol.qual and check_expr is not distinct from pol.check_expr then raise exception 'Unresolved legacy policy: %',pol.polname; end if;
 ddl:=format('alter policy %I on public.%I',pol.polname,pol.relname);
 if qual is not null then ddl:=ddl||' using ('||qual||')'; end if;
 if check_expr is not null then ddl:=ddl||' with check ('||check_expr||')'; end if;
 execute ddl;
 end loop;
 if exists(select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and exists(select 1 from pg_depend d join pg_proc f on f.oid=d.refobjid join pg_namespace fn on fn.oid=f.pronamespace where d.classid='pg_policy'::regclass and d.objid=p.oid and d.refclassid='pg_proc'::regclass and fn.nspname='public' and f.proname in ('is_member','is_platform_admin'))) then raise exception 'Legacy RLS dependencies remain'; end if;
end $repair$;
