-- BarberOS | Fase 8 | cover incident foreign-key access paths.
-- Forward-only repair for the platform's public-FK covering-index contract.
create index if not exists shop_operation_incidents_order_tenant_fk_idx
  on public.shop_operation_incidents(order_id,barbershop_id);
create index if not exists shop_operation_incident_events_incident_tenant_fk_idx
  on public.shop_operation_incident_events(incident_id,barbershop_id);
create index if not exists shop_operation_incident_events_actor_id_fk_idx
  on public.shop_operation_incident_events(actor_id);
