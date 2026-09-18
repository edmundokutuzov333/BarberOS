# BarberOS FASE 22: Permissions

## Permission model

| Actor | Tenant data | Agenda / appointments | CRM | Configuration | Payments | Team | Platform admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous | Public RPC only | Public booking/token flows | None | None | Public token payment flows | None | None |
| Owner | Full tenant | Full tenant | Full tenant | Full | Read + provider configuration | Manage | Via separate platform role |
| Manager | Tenant operation | Full tenant | Full tenant | Operational | Read | No team administration | No |
| Barber | Own operational scope | Own appointments | Customers linked to own appointments | Own time blocks only | No | No | No |
| Platform admin | Platform scope | Platform RPCs | Platform RPCs | Platform scope | Platform scope | Platform scope | Full |

## Enforced boundaries

The database is the source of truth. Frontend route filtering is only a UX guard.

Sensitive writes and cross-role operations remain behind PostgreSQL RPCs. Direct client roles do not receive write privileges on appointments, payments, notifications, reviews, or waitlist_entries.

The team directory is owner/platform-admin only. Managers and barbers can see their own membership row through the existing ShopProvider query, but cannot enumerate the tenant team.

Barber direct reads are narrowed to their own barber record, their own appointment-linked customers, their own appointments, and their own reviews. Waitlist, payment, notification, and team-management surfaces are not available to barbers.

Anonymous access is restricted to the public customer journey: public shop data, availability, booking, token-based booking management, public waitlist offer/claim, reviews by token, and payment-by-token flows.

## UI / UX / CX / SD

The app shell uses one permission model for route guards, sidebar navigation and mobile navigation. Restricted routes return an explicit access state instead of leaving blank or broken screens.

Settings tabs are filtered by role. Payment credential configuration and team administration are owner-only.

The dashboard uses a tenant-scoped PostgreSQL read model, so the UI does not directly query appointments, customers, working hours, barbers, waitlist or reviews. The dashboard also removes manager-only actions from barber views.

## Acceptance

Run supabase/tests/phase22_permissions.sql after applying the Phase 22 migration. The test creates only temporary rows inside a transaction and rolls them back.
