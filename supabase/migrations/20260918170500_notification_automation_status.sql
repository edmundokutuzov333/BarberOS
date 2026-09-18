-- BarberOS Phase 15 patch: tenant-safe scheduler health read model.
create or replace function public.get_notification_automation_status(
  p_shop uuid
)
returns table(
  dispatcher_active boolean,
  dispatcher_last_run_at timestamptz,
  dispatcher_last_run_status text,
  dispatcher_last_run_message text
)
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.require_shop_operator(p_shop);

  return query
  select
    exists (
      select 1 from cron.job
      where jobname='barberos-notify-dispatch'
        and active
    ),
    (
      select max(r.start_time)
      from cron.job_run_details r
      join cron.job j on j.jobid=r.jobid
      where j.jobname='barberos-notify-dispatch'
    ),
    (
      select r.status
      from cron.job_run_details r
      join cron.job j on j.jobid=r.jobid
      where j.jobname='barberos-notify-dispatch'
      order by r.start_time desc
      limit 1
    ),
    (
      select left(r.return_message,500)
      from cron.job_run_details r
      join cron.job j on j.jobid=r.jobid
      where j.jobname='barberos-notify-dispatch'
      order by r.start_time desc
      limit 1
    );
end;
$function$;

revoke all on function public.get_notification_automation_status(uuid)
from public,anon;
grant execute on function public.get_notification_automation_status(uuid)
to authenticated;

comment on function public.get_notification_automation_status(uuid)
is 'Tenant-safe view of the notification dispatcher scheduler health for Owner/Manager/Barber operator access. Does not expose cron job internals beyond the dispatcher heartbeat.';
