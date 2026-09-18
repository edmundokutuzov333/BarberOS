-- BarberOS Phase 22 patch: notifications are operator-only.
create or replace function public.get_notification_metrics(p_shop uuid)
returns table(
  queued_count bigint,
  processing_count bigint,
  failed_count bigint,
  sent_today_count bigint,
  sent_7d_count bigint,
  delivery_rate_7d numeric
)
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.require_shop_operator(p_shop);

  return query
  select
    count(*) filter (where n.status='queued')::bigint,
    count(*) filter (where n.status='processing')::bigint,
    count(*) filter (where n.status='failed')::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= date_trunc('day',now()))::bigint,
    count(*) filter (where n.status='sent' and n.sent_at >= now()-interval '7 days')::bigint,
    case
      when count(*) filter (
        where n.status in ('sent','failed')
          and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
      ) = 0 then 0::numeric
      else round(
        100.0 * count(*) filter (
          where n.status='sent'
            and n.sent_at >= now()-interval '7 days'
        ) / count(*) filter (
          where n.status in ('sent','failed')
            and coalesce(n.sent_at,n.last_attempt_at) >= now()-interval '7 days'
        ),2)
    end
  from public.notifications n
  where n.barbershop_id=p_shop;
end;
$$;

comment on function public.get_notification_metrics(uuid)
is 'Tenant notification metrics for owner/manager only.';
