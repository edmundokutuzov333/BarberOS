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

## Operational planning and communication drafts

Operations reads historical and future report_daily ranges with the caller JWT. Weekday occupancy is weighted by minutes, at least four comparable open days, excludes zero-capacity days; missing or duplicate dates are unknown. Upcoming remaining minutes are aggregate only and never assert bookable slots. Marketing is suggested only for low reserved and historically low occupancy; no automatic posting, discount or customer contact. Setup progress reflects existing onboarding_step, not independent readiness certification. Draft actions are purpose-selected server templates, not generative AI, do not read Gmail data or send it to any external provider. Gmail compose/reply previews protect existing text and require explicit insertion and manual send. No database changes or paid API calls.

## Inventory and review intelligence

Owner/manager only. Inventory uses caller JWT and existing tenant RLS. Only active tracked products and active variants; 30 elapsed days of negative sale movements (gross exits, excluding waste, return, adjustments). Exact-count bounded reads fail closed rather than silently truncating above 1000 rows per input. Coverage and 14-day stock target require 30-day product/variant age, >=5 units and >=3 distinct UTC sales days. No availability, supplier lead time, net demand or stock purchase claim. First 50 rows by priority. Reviews use the existing get_reviews RPC, latest 100 including hidden, aggregate rating distribution and explicit Portuguese keyword mentions only; no semantic sentiment, no comment text returned and no external processing. Drafts generic and manually reviewed. No writes or automatic publication.

## Financial intelligence

Read-only owner/manager action. Equal complete periods using shop timezone. Service revenue is completed appointment value, not payments or profit. Staff earnings summary reconciles completed counts and historical commission snapshots before residual is shown; unknown snapshots remain unknown. Tips are separate. Service mix shown only if revenue and completed counts reconcile. Team indicators are contextual, not employee scores. Store known cost and gross margin are separate order-created cohort figures (existing RPC uses Africa/Maputo), not cash settlement or a consolidated P&L; partial cost coverage is labelled. No changes to payments or commission records. Finance is available in management intelligence and reports with its own explicit period selector.
