"""Run rollback-safe BarberOS acceptance suites against a dedicated test database."""

from __future__ import annotations
import os
import re
from pathlib import Path
import psycopg

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "supabase" / "tests"

FILES = [
    "migration_phase2.sql","security_phase1.sql","domain_integrity_phase3.sql","availability_phase4.sql",
    "booking_phase5.sql","appointment_token_phase6.sql","public_barbershop_phase7.sql","booking_wizard_phase8.sql",
    "agenda_phase9.sql","realtime_phase10.sql","manual_booking_phase11.sql","customer_crm_phase12.sql",
    "waitlist_phase13.sql","notifications_phase14.sql","cron_phase15.sql","payments_phase16.sql",
    "payments_e2e_phase16.sql","reviews_phase17.sql","reports_phase18.sql","admin_phase19.sql",
    "phase22_permissions.sql","phase23_contract.sql","phase23_behavior.sql",
]

database_url = os.getenv("BARBEROS_TEST_DATABASE_URL")
if not database_url:
    print("SKIP: BARBEROS_TEST_DATABASE_URL não definido.")
    raise SystemExit(0)

if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit("REFUSED: BARBEROS_TEST_ALLOW_MUTATION=1 é obrigatório para esta suite.")

for filename in FILES:
    path = TESTS / filename
    if not path.exists(): raise SystemExit(f"MISSING_TEST_FILE: {filename}")
    sql = path.read_text(encoding="utf-8")
    if re.search(r"\bcommit\b", sql, re.I): raise SystemExit(f"SAFETY_ABORT_COMMIT_IN_TEST: {filename}")
    if filename not in {"migration_phase2.sql","security_phase1.sql","phase23_contract.sql"}:
      if not re.search(r"\bbegin\b", sql, re.I) or not re.search(r"\brollback\b", sql, re.I):
        raise SystemExit(f"SAFETY_ABORT_TRANSACTION_GUARD: {filename}")

with psycopg.connect(database_url, autocommit=True, prepare_threshold=None) as conn:
    for filename in FILES:
        print(f"RUN {filename}")
        conn.execute((TESTS / filename).read_text(encoding="utf-8"))
        print(f"PASS {filename}")

print(f"Phase 23 database suite: {len(FILES)}/{len(FILES)} files executed.")
