"""Run rollback-safe BarberOS acceptance suites against a dedicated test database."""

from __future__ import annotations
import os
import re
from pathlib import Path
import psycopg
from psycopg import ClientCursor
from database_safety import require_isolated_test_database

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "supabase" / "tests"

FILES = [
    "migration_phase2.sql","security_phase1.sql","domain_integrity_phase3.sql","availability_phase4.sql",
    "booking_phase5.sql","appointment_token_phase6.sql","public_barbershop_phase7.sql","booking_wizard_phase8.sql",
    "agenda_phase9.sql","realtime_phase10.sql","manual_booking_phase11.sql","customer_crm_phase12.sql",
    "waitlist_phase13.sql","notifications_phase14.sql","cron_phase15.sql","payments_phase16.sql",
    "payments_e2e_phase16.sql","reviews_phase17.sql","reports_phase18.sql","admin_phase19.sql",
    "phase22_permissions.sql","phase23_contract.sql","phase23_behavior.sql",
    "shop_domain_phase1.sql","shop_catalog_phase2.sql","shop_catalog_rules_phase2.sql",
    "shop_public_catalog_phase3.sql","shop_order_atomic_phase4.sql","shop_order_operations_phase5.sql",
    "shop_catalog_phase7.sql","shop_phase7_pilot_day.sql","shop_order_payments_phase8.sql",
]

database_url = require_isolated_test_database(os.getenv("BARBEROS_TEST_DATABASE_URL"))

if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit("REFUSED: BARBEROS_TEST_ALLOW_MUTATION=1 é obrigatório para esta suite.")

# Contracts in this list perform read-only schema/data checks or assert that
# unauthorised mutations are rejected. They must never write persistent state.
READ_ONLY_FILES = {
    "migration_phase2.sql",
    "security_phase1.sql",
    "domain_integrity_phase3.sql",
    "agenda_phase9.sql",
    "public_barbershop_phase7.sql",
    "realtime_phase10.sql",
    "phase23_contract.sql",
}

# These contracts exercise mutating RPCs only inside a PL/pgSQL exception
# subtransaction and deliberately raise/catch a rollback sentinel.
ROLLBACK_BLOCK_FILES = {
    "availability_phase4.sql",
    "booking_phase5.sql",
    "appointment_token_phase6.sql",
    "booking_wizard_phase8.sql",
}

def strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*[\s\S]*?\*/", "", sql)
    return re.sub(r"--[^\n]*", "", sql)

for filename in FILES:
    path = TESTS / filename
    if not path.exists(): raise SystemExit(f"MISSING_TEST_FILE: {filename}")
    sql = path.read_text(encoding="utf-8")
    uncommented = strip_sql_comments(sql)

    # Only SQL-level transaction commands count; PL/pgSQL BEGIN/EXCEPTION
    # blocks are not outer transactions.
    if re.search(r"^\s*commit\s*;", uncommented, re.I | re.M):
        raise SystemExit(f"SAFETY_ABORT_COMMIT_IN_TEST: {filename}")

    has_outer_begin = bool(re.search(r"^\s*begin\s*;", uncommented, re.I | re.M))
    has_outer_rollback = bool(re.search(r"^\s*rollback\s*;", uncommented, re.I | re.M))
    if has_outer_begin:
        if not has_outer_rollback:
            raise SystemExit(f"SAFETY_ABORT_TRANSACTION_GUARD: {filename}")
    elif filename in READ_ONLY_FILES:
        pass
    elif filename in ROLLBACK_BLOCK_FILES:
        if not re.search(r"ROLLBACK_[A-Z0-9_]+", sql) or not re.search(r"\bexception\b", uncommented, re.I):
            raise SystemExit(f"SAFETY_ABORT_ROLLBACK_BLOCK_GUARD: {filename}")
    else:
        raise SystemExit(f"SAFETY_ABORT_TRANSACTION_GUARD: {filename}")

def execute_sql_script(conn: psycopg.Connection, path: Path) -> None:
    """Execute a complete SQL file, including PL/pgSQL DO blocks and multiple statements.

    ClientCursor uses the simple query protocol. psycopg's regular cursor parses
    semicolons in a multi-statement SQL file as separate commands, which can
    split a dollar-quoted DO block and produce a syntax error at '
print(f"Phase 23 database suite: {len(FILES)}/{len(FILES)} contracts executed.")
.
    """
    sql = path.read_text(encoding="utf-8")
    try:
        with ClientCursor(conn) as cursor:
            cursor.execute(sql)
    except Exception:
        # A failed DO block can prevent the trailing ROLLBACK in a multi-statement
        # script from executing. End that transaction before fixture cleanup, then
        # re-raise the original acceptance failure.
        conn.rollback()
        raise


with psycopg.connect(database_url, autocommit=True) as conn:
    fixture_created = False
    try:
        print("SETUP phase23_fixture_setup.sql")
        execute_sql_script(conn, TESTS / "phase23_fixture_setup.sql")
        fixture_created = True
        print("PASS phase23_fixture_setup.sql")

        for filename in FILES:
            print(f"RUN {filename}")
            execute_sql_script(conn, TESTS / filename)
            print(f"PASS {filename}")
    finally:
        if fixture_created:
            print("CLEANUP phase23_fixture_cleanup.sql")
            execute_sql_script(conn, TESTS / "phase23_fixture_cleanup.sql")
            print("PASS phase23_fixture_cleanup.sql")

print(f"Phase 23 database suite: {len(FILES)}/{len(FILES)} contracts executed.")
