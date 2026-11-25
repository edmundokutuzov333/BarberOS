# BarberOS Intelligence — internal management

The `/app/inteligencia` route is available to owner and manager members only. The Edge Function independently authenticates the session, enforces password rotation and membership, applies rate limits, and uses the caller JWT for all business RPCs. No new tables or migrations are required: existing reporting, CRM, waitlist, notifications and shop contracts remain the source of truth. No payments, public booking routes or message delivery are modified.

## Zero-cost mode

The deterministic engine runs on Supabase Edge, never on user hardware. It has no model dependency. Optional generic Groq advice uses the fixed model openai/gpt-oss-20b, no user text, IDs, customer data or financial metrics, no retries, 8s deadline and fixed global/shop request quotas. It is disabled unless both BARBEROS_AI_GROQ_FREE_CONFIRMED=true and BARBEROS_AI_GROQ_KEY are provisioned server-side. Only set these after verifying the account is Free and cannot incur charges; remove immediately on plan changes. App quotas alone cannot guarantee a provider will not bill if the account changes. No paid fallback. Do not commit keys. Existing infrastructure quotas still apply.

## Semantics

Completed historical periods exclude today; today's bookings come from dashboard. Revenue is the reporting engine's estimated revenue, not cash, payments or profit. No-show denominator is completed + no-show only. Forecast is an empirical weekday mean/range with at least four observations and twenty historic bookings, not a calibrated prediction or current availability. CRM recovery is aggregate only, not a churn classifier. No autonomous writes or outbound contact. Unknown queries are directed to supported topics. The external model provides generic guidance only, explicitly distinguished from real business insights.

## Verification

Run node --test supabase/functions/barber-intelligence/engine.test.mjs; deno check --node-modules-dir=auto supabase/functions/barber-intelligence/index.ts; frontend lint/typecheck/build and the repository's existing isolation suites. Verify production/staging function deployment and role boundaries with authenticated synthetic owner, manager, barber, cross-tenant and anonymous sessions before certification. Cloud configuration and live provider acceptance are separate gates. Never change the captured production contract until deployment evidence exists.

## Customer intelligence

Owner/manager-only, explicitly requested on the customer detail page. The edge calls the existing get_customer and get_customer_appointments RPCs with the caller JWT, reads at most 100 recent appointments, and calculates distinct visit-day median intervals (at least 3 intervals), recorded absence proportion (at least 5 resolved visits), and uniquely frequent services. Existing future booking or in-progress appointment suppresses recovery drafts. No external provider receives customer information. No automatic contact, customer scoring penalty, price change or persistent inference. The date is an indicative historic cycle, not availability. Run scripts/test-intelligence-http.mjs only in disposable local CI, never against production. The script creates and removes test fixtures and verifies owner/manager/barber/outsider/anonymous and revoked access.
