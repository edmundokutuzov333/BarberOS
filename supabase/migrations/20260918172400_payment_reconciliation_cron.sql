-- BarberOS Phase 16: payment reconciliation scheduler.

do $do$
declare r record;
begin
  for r in select jobid from cron.job where jobname='barberos-payments-reconcile' loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$do$;

select cron.schedule(
  'barberos-payments-reconcile',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='barberos_project_url')
        || '/functions/v1/payments-reconcile',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='barberos_publishable_key'),
        'x-barberos-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='barberos_cron_secret')
      ),
      body := jsonb_build_object('limit',25)
    ) as request_id;
  $cron$
);

comment on function public.get_public_payment_methods(text)
is 'Returns only provider methods that are enabled and have server-side credentials configured for a public shop.';
