# BarberOS Seeds

Seeds are for deterministic reference/configuration data only.

Allowed:
- product plan definitions
- static reference enumerations when required by the domain

Not allowed:
- fake customers
- fake appointments
- fake payments
- fake reviews
- fake barbershops
- credentials
- test passwords

Tests that need mutable data must create it in an isolated test database through explicit test tooling.
