-- Leading-column FK indexes for tenant-scoped relations; align staging with
-- the existing production Gmail/support indexes without duplicating them.
create index if not exists service_addons_primary_service_tenant_idx on public.service_addons(service_id,barbershop_id);
create index if not exists haircut_service_offers_style_tenant_idx on public.haircut_service_offers(haircut_id,barbershop_id);
create index if not exists haircut_barber_skills_style_tenant_idx on public.haircut_barber_skills(haircut_id,barbershop_id);
create index if not exists gmail_connections_gmail_connections_connected_by_fk_idx on public.gmail_connections(connected_by);
create index if not exists gmail_oauth_states_gmail_oauth_states_barbershop__fk_idx on public.gmail_oauth_states(barbershop_id);
create index if not exists gmail_oauth_states_gmail_oauth_states_user_id_fke_fk_idx on public.gmail_oauth_states(user_id);
create index if not exists support_tickets_support_tickets_created_by_fke_fk_idx on public.support_tickets(created_by);
