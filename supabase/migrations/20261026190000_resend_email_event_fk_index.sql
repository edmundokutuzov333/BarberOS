-- Missing supporting index found during the 2026-10-26 migration/schema reconciliation.
-- The webhook event ledger is service-role only; this index prevents notification deletion
-- and reconciliation joins from scanning the full event ledger.
create index if not exists resend_email_events_notification_id_idx
  on public.resend_email_events(notification_id);
comment on index public.resend_email_events_notification_id_idx is
  'Supports FK lookups from notification_id when a notification row is deleted or reconciled.';
