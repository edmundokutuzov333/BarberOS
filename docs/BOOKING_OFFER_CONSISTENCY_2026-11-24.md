# Booking offer consistency — 2026-11-24

## Design and boundaries

The original service remains the commercial parent, with an explicitly linked style
as a priced/timed variant. Missing variant fields inherit the parent. Unlinked
styles are visual references, not universally bookable. The same resolver and
duration-aware availability engine serve public, manual and waitlist booking.
Legacy four-/five-argument availability RPCs retain their contracts. New RPCs
accept the selected style, never a client-supplied duration. Appointment price and
duration are snapshots; changing a catalog link does not invalidate the
unchanged historical pair or authorize a cross-tenant change.

This is an incremental forward-only release, not a parallel booking system.
Known starter styles are linked to uniquely matching active parent services;
existing explicit merchant links are not changed. A new starter seed only links
newly inserted rows. A style without a matching service remains a visual reference
until the merchant explicitly configures it. No customer or appointment data is
rewritten; payment settings remain untouched.

The public and manual journeys filter styles by actual association, display the
effective price and duration, use style-aware availability/cache keys, clear the
selected slot on a changed choice, and skip irrelevant style screens. Public
catalog cards can start a reservation directly; open days without slots can enter
the waitlist. The style editor explains inheritance and validates price/duration.

## Acceptance

The versioned SQL was applied to staging in three forward migrations.
The transactional acceptance suite exercises invalid and unlinked pairs,
effective price and duration, narrower availability, booking overlap, persisted
snapshots and token display, token rescheduling, historical cross-barber operator
rescheduling after catalog edits, direct-write rejection, manual booking,
starter catalog association and repeat-seeding merchant choice. The fixture
transaction rolls back. Initial operator-reschedule acceptance exposed SQLSTATE
42702 (the output column appointment_id collided with a notifications column).
The third forward migration qualifies the column and rechecks the locked
appointment; the corrected scenario passed.

No payment provider is called. Full release gates still include the current main
CI results and deployed browser acceptance. This increment does not implement
a many-to-many per-service style offer catalog, per-style barber skill records,
a configurable category hierarchy, multi-service add-ons or immutable quote
negotiation. These require their own domain contracts and explicit merchant data;
the current service-level qualification is not a proof of specific technique skill.
