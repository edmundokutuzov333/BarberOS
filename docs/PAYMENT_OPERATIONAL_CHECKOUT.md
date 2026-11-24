# Operational Payment Simulator (staging only)

The existing admin laboratory remains independent. This checkout additionally
links to real QA booking, delivered-order and assigned-plan rows. Production
payments stay disabled. The SQL enrollment table starts empty in all deployments.
Only the explicitly enrolled staging shop `shop-phase8-preview-qa` is configured
for testing. The UI requires the staging project URL and the lab build flag.

- Booking wizard displays a simulated deposit; the normal booking engine creates
  a pending hold. Customer management token authorizes checkout via the existing
  rate-limited token gateway. Successful payment confirms the QA appointment
  atomically; timeout preserves the hold, and late payment requires refund.
- Service balance is payable after completion, less confirmed deposit and prior
  simulated settlements. Product balance is limited to delivered quantity less
  existing settlements. No live payments or inventory movements are inserted.
- Admin > Planos shows the enrolled QA shop's assigned active plan and calendar
  month's amount. A successful test settles that period in the QA ledger, not a
  commercial invoice or automated recurring debit.
- Payment attempts and events are separate private tables; RPC authorization,
  idempotency, row/advisory locks and server-side pricing apply. No wallet request
  is sent. Outbound notifications are suppressed for enrolled QA shops.
- Refunds of a valid confirmed deposit cancel the QA appointment; refunds after
  service progression are rejected. Late payments do not confirm the booking.
- Run `supabase/tests/payment_operational_checkout.sql` on disposable DB/staging
  with rollback. CI runs it from a clean migration chain.

Public test shop: https://barberos-payment-lab.vercel.app/barbearia/shop-phase8-preview-qa/marcar
Admin subscriptions: https://barberos-payment-lab.vercel.app/admin/planos
No production credentials or real customer data should be used.

Staff: authorized owner/manager of the enrolled shop can review QA receipts in
`/app/pagamentos` and `/app/loja/pagamentos`; the former also includes the
monthly plan checkout. Platform admins retain access from Admin > Planos.
The staff read API never returns the customer manage token.
