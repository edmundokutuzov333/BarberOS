-- Add covering indexes for public foreign keys that lack a matching
-- leading-column index. This migration is schema-aware because staging is being
-- reconciled without resetting data and does not yet contain every legacy table.
do $migration$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name,
      con.conkey as fk_attnums,
      (
        select string_agg(format('%I', a.attname), ', ' order by k.ord)
        from unnest(con.conkey) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) as column_sql
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and (
            select array_agg(k.attnum::smallint order by k.ord)
            from unnest(i.indkey) with ordinality k(attnum, ord)
            where k.ord <= cardinality(con.conkey)
          ) = con.conkey
      )
    order by c.relname, con.conname
  loop
    index_name := left(fk.table_name, 25) || '_' || left(fk.constraint_name, 30) || '_fk_idx';
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      fk.column_sql
    );
  end loop;
end;
$migration$;
