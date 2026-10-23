"""Deterministic acceptance test for same-slot booking concurrency.

Creates and removes an isolated tenant fixture in the ephemeral CI database.
"""

from __future__ import annotations

import os
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path

import psycopg
from database_safety import require_isolated_test_database

DB = require_isolated_test_database(os.getenv("BARBEROS_TEST_DATABASE_URL"))
ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "supabase" / "tests"

if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit("REFUSED: BARBEROS_TEST_ALLOW_MUTATION=1 é obrigatório.")


@dataclass
class Result:
    ok: bool = False
    value: object | None = None
    error: str | None = None


def fixture(conn):
    with conn.cursor() as cur:
        # Reuse the same deterministic isolated shop fixture used by the Phase 4
        # two-session stock race; this job has its own ephemeral database.
        cur.execute((TESTS / "shop_order_concurrency_setup_phase4.sql").read_text(encoding="utf-8"))
        cur.execute(
            """
            select shop_id, slug, service_id, barber_id, slot_a
            from private.phase4_concurrency_fixture
            where singleton
            """
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("PHASE24_CONCURRENCY_FIXTURE_UNAVAILABLE")
        return row


def cleanup(shop_id):
    with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id from public.customers where barbershop_id=%s",
                (shop_id,),
            )
            customer_ids = [row[0] for row in cur.fetchall()]
            cur.execute("delete from public.appointments where barbershop_id=%s", (shop_id,))
            if customer_ids:
                cur.execute("delete from public.customers where id = any(%s)", (customer_ids,))
            cur.execute("delete from private.phase4_concurrency_fixture where shop_id=%s", (shop_id,))
            cur.execute("delete from public.barbershops where id=%s", (shop_id,))


def book_a(result, transaction_open, release_commit, slug, service_id, barber_id, slot):
    phone = "+25884" + uuid.uuid4().hex[:7]
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                (slug, service_id, None, barber_id, slot, "Phase 24 A", phone, None),
            )
            result.ok = True
            result.value = cur.fetchone()
            transaction_open.set()
            if not release_commit.wait(timeout=30):
                raise RuntimeError("PHASE24_A_COMMIT_RELEASE_TIMEOUT")
            conn.commit()
    except Exception as exc:
        result.error = str(exc)
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        conn.close()


def book_b(result, started, slug, service_id, barber_id, slot):
    phone = "+25885" + uuid.uuid4().hex[:7]
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None)
    try:
        started.set()
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                    (slug, service_id, None, barber_id, slot, "Phase 24 B", phone, None),
                )
                result.ok = True
                result.value = cur.fetchone()
                conn.commit()
            except Exception as exc:
                result.error = str(exc)
                conn.rollback()
    finally:
        conn.close()


shop_id = None
try:
    with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as setup:
        shop_id, slug, service_id, barber_id, slot = fixture(setup)

    a = Result()
    b = Result()
    a_open = threading.Event()
    b_started = threading.Event()
    release_a = threading.Event()

    ta = threading.Thread(target=book_a, args=(a, a_open, release_a, slug, service_id, barber_id, slot))
    ta.start()
    if not a_open.wait(10):
        raise RuntimeError("PHASE24_A_DID_NOT_REACH_BOOKING_COMMIT_POINT")

    tb = threading.Thread(target=book_b, args=(b, b_started, slug, service_id, barber_id, slot))
    tb.start()
    if not b_started.wait(10):
        release_a.set()
        raise RuntimeError("PHASE24_B_DID_NOT_START")

    release_a.set()
    ta.join(45)
    tb.join(45)
    if ta.is_alive() or tb.is_alive():
        raise RuntimeError("PHASE24_CONCURRENCY_TIMEOUT")
    if not a.ok:
        raise RuntimeError(f"PHASE24_A_FAILED: {a.error}")
    if b.ok:
        raise RuntimeError("PHASE24_B_UNEXPECTED_SUCCESS")
    if "SLOT_TAKEN" not in (b.error or ""):
        raise RuntimeError(f"PHASE24_B_WRONG_ERROR: {b.error}")

    with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as verify:
        with verify.cursor() as cur:
            cur.execute(
                """
                select count(*)
                from public.appointments a
                where a.barbershop_id=%s
                  and a.barber_id=%s
                  and a.starts_at=%s
                  and a.status in ('pending','confirmed','in_progress')
                """,
                (shop_id, barber_id, slot),
            )
            count = cur.fetchone()[0]
            if count != 1:
                raise RuntimeError(f"PHASE24_PERSISTED_APPOINTMENT_COUNT_INVALID:{count}")

    print("PASS | Phase 24 DB concurrency: A=success, B=SLOT_TAKEN, persisted appointments=1.")
finally:
    if shop_id:
        cleanup(shop_id)
