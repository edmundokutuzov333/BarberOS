-- Reconcile the production project with the public booking gateway prerequisites.
-- All objects are idempotent so this migration is safe after partial/manual recovery.
create schema if not exists private;

create table if not exists private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
revoke all on private.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_consume(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(coalesce(p_bucket, '')) not between 1 and 200 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update
    set hits = r.hits + 1
  returning r.hits into v_hits;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  retry_after_seconds := greatest(
    ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer,
    1
  );
  return next;
end
$function$;

revoke all on function public.rate_limit_consume(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_consume(text, integer, integer) to service_role;

create table if not exists public.booking_idempotency (
  key uuid primary key,
  response jsonb,
  created_at timestamptz not null default now()
);
alter table public.booking_idempotency enable row level security;
revoke all on public.booking_idempotency from public, anon, authenticated;
grant select on public.booking_idempotency to service_role;

revoke execute on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.book_appointment(text, uuid, uuid, uuid, timestamptz, text, text, text)
  to service_role;
