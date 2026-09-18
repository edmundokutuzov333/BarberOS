-- Phase 19 hardening: align auth.users email with the text return contract.
create or replace function public.admin_list_users(p_search text default null,p_limit integer default 50,p_offset integer default 0)
returns table(id uuid,email text,full_name text,phone text,avatar_url text,is_platform_admin boolean,is_confirmed boolean,last_sign_in_at timestamptz,created_at timestamptz,shop_count bigint,shop_roles jsonb,total_count bigint)
language plpgsql security definer stable set search_path=''
as $$
begin
  perform private.require_platform_admin();
  if p_limit<1 or p_limit>100 then raise exception 'INVALID_LIMIT'; end if;
  if p_offset<0 then raise exception 'INVALID_OFFSET'; end if;
  return query
  with base as (
    select pr.*,u.email::text user_email,(u.confirmed_at is not null) confirmed_value,u.last_sign_in_at,count(*) over() total_count_value
    from public.profiles pr join auth.users u on u.id=pr.id
    where nullif(trim(p_search),'') is null or pr.full_name ilike '%'||trim(p_search)||'%' or pr.phone ilike '%'||trim(p_search)||'%' or u.email ilike '%'||trim(p_search)||'%'
    order by pr.created_at desc limit p_limit offset p_offset
  )
  select b.id,b.user_email::text,b.full_name,b.phone,b.avatar_url,b.is_platform_admin,b.confirmed_value,b.last_sign_in_at,b.created_at,
    (select count(*) from public.barbershop_members m where m.user_id=b.id),
    coalesce((select jsonb_agg(jsonb_build_object('shop_id',m.barbershop_id,'shop_name',s.name,'role',m.role) order by s.name) from public.barbershop_members m join public.barbershops s on s.id=m.barbershop_id where m.user_id=b.id),'[]'::jsonb),
    b.total_count_value
  from base b order by b.created_at desc,b.full_name nulls last,b.user_email;
end;
$$;
revoke all on function public.admin_list_users(text,integer,integer) from public,anon,authenticated;
grant execute on function public.admin_list_users(text,integer,integer) to authenticated;