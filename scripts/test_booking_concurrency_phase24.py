"""Deterministic acceptance test for same-slot booking concurrency.

This test requires a dedicated PostgreSQL test database. It intentionally
mutates only that isolated environment and removes its own fixtures.
"""

from __future__ import annotations

import os
import threading
import uuid
from dataclasses import dataclass

import psycopg

DB = os.getenv("BARBEROS_TEST_DATABASE_URL")
if not DB:
    print("SKIP: BARBEROS_TEST_DATABASE_URL não definido.")
    raise SystemExit(0)

if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit("REFUSED: BARBEROS_TEST_ALLOW_MUTATION=1 é obrigatório.")

@dataclass
class Result:
    ok: bool = False
    value: object | None = None
    error: str | None = None

def fixture(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            select b.slug, s.id, br.id
            from public.barbershops b
            join public.services s
              on s.barbershop_id=b.id
             and s.is_active
            join public.barber_services bs
              on bs.service_id=s.id
            join public.barbers br
              on br.id=bs.barber_id
             and br.is_active
            where b.status in ('trial','active')
            order by b.created_at, s.sort_order, br.sort_order
            limit 1
            """
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("PHASE24_CONCURRENCY_FIXTURE_UNAVAILABLE")

        slug, service_id, barber_id = row
        cur.execute("select ((now() at time zone 'Africa/Maputo')::date + 1)")
        test_day = cur.fetchone()[0]
        cur.execute(
            """
            select slot_start
            from public.get_available_slots(%s,%s,%s,%s)
            where slot_start > now() + interval '20 minutes'
            order by slot_start
            limit 1
            """,
            (slug, service_id, barber_id, test_day),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("PHASE24_CONCURRENCY_SLOT_UNAVAILABLE")

        return slug, service_id, barber_id, row[0]

def book_a(result, transaction_open, release_commit, slug, service_id, barber_id, slot):
    phone = "+25884" + uuid.uuid4().hex[:7]
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    slug,
                    service_id,
                    None,
                    barber_id,
                    slot,
                    "Phase 24 A",
                    phone,
                    None,
                ),
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
    phone = "+25884" + uuid.uuid4().hex[:7]
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None)
    try:
        started.set()
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                    (
                        slug,
                        service_id,
                        None,
                        barber_id,
                        slot,
                        "Phase 24 B",
                        phone,
                        None,
                    ),
                )
                result.ok = True
                result.value = cur.fetchone()
                conn.commit()
            except Exception as exc:
                result.error = str(exc)
                conn.rollback()
    finally:
        conn.close()

with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as setup:
    slug, service_id, barber_id, slot = fixture(setup)

a = Result()
b = Result()
a_open = threading.Event()
b_started = threading.Event()
release_a = threading.Event()

ta = threading.Thread(
    target=book_a,
    args=(a, a_open, release_a, slug, service_id, barber_id, slot),
)
ta.start()

if not a_open.wait(10):
    raise SystemExit("PHASE24_A_DID_NOT_REACH_BOOKING_COMMIT_POINT")

tb = threading.Thread(
    target=book_b,
    args=(b, b_started, slug, service_id, barber_id, slot),
)
tb.start()

if not b_started.wait(10):
    release_a.set()
    raise SystemExit("PHASE24_B_DID_NOT_START")

release_a.set()

ta.join(45)
tb.join(45)

if ta.is_alive() or tb.is_alive():
    raise SystemExit("PHASE24_CONCURRENCY_TIMEOUT")

if not a.ok:
    raise SystemExit(f"PHASE24_A_FAILED: {a.error}")

if b.ok:
    raise SystemExit("PHASE24_B_UNEXPECTED_SUCCESS")

if "SLOT_TAKEN" not in (b.error or ""):
    raise SystemExit(f"PHASE24_B_WRONG_ERROR: {b.error}")

with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as verify:
    with verify.cursor() as cur:
        cur.execute(
            """
            select count(*)
            from public.appointments a
            join public.barbershops s on s.id=a.barbershop_id
            where s.slug=%s
              and a.barber_id=%s
              and a.starts_at=%s
              and a.status in ('pending','confirmed','in_progress')
            """,
            (slug, barber_id, slot),
        )
        count = cur.fetchone()[0]
        if count != 1:
            raise SystemExit(f"PHASE24_PERSISTED_APPOINTMENT_COUNT_INVALID:{count}")

        cur.execute(
            """
            select customer_id
            from public.appointments a
            join public.barbershops s on s.id=a.barbershop_id
            where s.slug=%s
              and a.barber_id=%s
              and a.starts_at=%s
              and a.status in ('pending','confirmed','in_progress')
            """,
            (slug, barber_id, slot),
        )
        appointment_row = cur.fetchone()
        customer_id = appointment_row[0] if appointment_row else None

        cur.execute(
            """
            delete from public.appointments
            where barbershop_id=(select id from public.barbershops where slug=%s)
              and barber_id=%s
              and starts_at=%s
              and status in ('pending','confirmed','in_progress')
            """,
            (slug, barber_id, slot),
        )

        if customer_id:
            cur.execute(
                "delete from public.customers where id=%s",
                (customer_id,),
            )

print("PASS | Phase 24 DB concurrency: A=success, B=SLOT_TAKEN, persisted appointments=1.")
