# Loja da Barbearia: execution contract

Source: user-supplied BarberOS_Loja_Barbearia.pdf, version 1.0, 27 pages.
Current user decisions override the older rollout proposal: enable the store for
all existing and future barbershops; keep payments unavailable; implement store,
then order/booking engines, access/entry UX, settings, and themes last.

The architecture extends the existing tenant-scoped catalogue, atomic booking/
order RPC and inventory ledger. A separate commerce platform would duplicate the
booking lifecycle; a full rewrite would discard tested constraints and snapshots.
Typed feature modules and narrowly scoped forward migrations preserve that base.

Product identity, exact format and photographs must have a real source. Reference
retailer prices are evidence for a configured starting offer, not claims about a
shop's previous prices or physical stock. Unknown physical inventory must never
be populated with fictional quantities or presented as guaranteed availability.
A reference import must retain its provenance and support staff confirmation.

Acceptance covers the actual management/public path, tenant denial, runtime
validation, concurrent edits, publication requirements, price changes, image
provenance, inventory and retry. Tests use isolated fixtures; production catalogue
content must contain real products and never simulation data. The current database
has no production products and the store flags are false; these are starting facts,
not completed delivery. Payment providers must not be called by tests.
