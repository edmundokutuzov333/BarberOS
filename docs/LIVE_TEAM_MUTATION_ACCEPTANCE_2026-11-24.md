# Live team removal acceptance

The production browser exercised the published membership editor through the real
Supabase HTTP boundary, not a fixture response. The signed-in approved owner used
an isolated suspended QA barbershop with one synthetic member. The test inserted
no customer, booking, provider payment or mail job. It did not remove real staff
or change any real account password/rotation flag.

## Result

1. The owner selected the QA tenant through the real shop switcher; two members
   appeared, with no directory error.
2. The removal dialog was opened and cancelled. It closed and the member remained.
3. The dialog was reopened and removal confirmed through the actual button.
   The row disappeared and the dialog closed successfully.
4. Independent SQL inspection found exactly one owner, zero rows for the removed
   membership and exactly one member_removed audit event. The real owner's
   password_change_required flag remained false.
5. A full browser reload retained the QA tenant selection and showed only its
   owner. The deleted member did not return.
6. Guarded cleanup deleted the suspended QA shop and synthetic Auth user. Both
   absence checks returned true. The original shop selection was restored and
   the browser reloaded. No unrelated tenant was deleted or modified.

The exact fixture/cleanup manifest and detailed tool receipts are held as private
local audit artifacts. Cleanup checks the generated IDs, slug, suspended status,
fixture name and reserved example.invalid address, and rejects any unexpected
membership in another tenant. Audit events created inside this disposable QA
tenant were removed by its existing cascade during cleanup.

## Execution recovery

The first attempt stopped after fixture setup because its browser helper treated
a still-running terminal command as a failed completed command. Its finally block
cleaned both fixture records and restored the selection. The helper was corrected
to await terminal session completion, and the test was repeated successfully.
The local Colima barberos test VM was stopped gracefully to relieve pressure on
the 8 GB host before repeating browser automation. Its disks, containers, encrypted
backups and restoration receipts remain preserved; local Docker is currently
stopped and must be restarted before another isolated database run.

The completed mutation receipt complements, rather than replaces, the synthetic
SQL isolation/concurrency suites and eighteen controlled browser cases. Calendar,
staging OAuth/provider delivery and full release certification remain separate
open gates. No payment-provider integration was called or tested.
