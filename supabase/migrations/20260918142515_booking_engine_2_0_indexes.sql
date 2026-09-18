-- BarberOS Phase 5: indexes supporting appointment creation, queueing and audit lookup.
create index if not exists appointments_customer_start_idx
  on public.appointments(customer_id, starts_at);

create index if not exists appointments_service_start_idx
  on public.appointments(service_id, starts_at);

create index if not exists appointments_haircut_idx
  on public.appointments(haircut_id)
  where haircut_id is not null;

create index if not exists notifications_appointment_status_idx
  on public.notifications(appointment_id, status);

create index if not exists audit_logs_entity_action_idx
  on public.audit_logs(entity_id, action, created_at desc);
