"""Verify that two simultaneous bookings for the same slot yield exactly one success.

Requires a dedicated PostgreSQL test database through BARBEROS_TEST_DATABASE_URL.
The successful appointment is deleted in a final cleanup transaction.
"""

from __future__ import annotations

import os
import threading
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

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
        cur.execute("""
          select b.slug, s.id, br.id
          from public.barbershops b
          join public.services s on s.barbershop_id=b.id and s.is_active
          join public.barber_services bs on bs.service_id=s.id
          join public.barbers br on br.id=bs.barber_id and br.is_active
          where b.status in ('trial','active')
          order by b.created_at, s.sort_order, br.sort_order
          limit 1
        """)
        row = cur.fetchone()
        if not row:
            raise RuntimeError("PHASE23_CONCURRENCY_FIXTURE_UNAVAILABLE")
        slug, service_id, barber_id = row
        cur.execute(
            "select slot_start from public.get_available_slots(%s,%s,%s,%s) "
            "where slot_start > now() + interval '20 minutes' order by slot_start limit 1",
            (slug, service_id, barber_id, date.today() + timedelta(days=1)),
        )
        slot = cur.fetchone()
        if not slot:
            raise RuntimeError("PHASE23_CONCURRENCY_SLOT_UNAVAILABLE")
        return slug, service_id, barber_id, slot[0]

def book_worker(result: Result, slug, service_id, barber_id, slot, name, phone, ready: threading.Barrier, hold: threading.Event, commit: bool):
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None)
    try:
        ready.wait()
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                    (slug, service_id, None, barber_id, slot, name, phone, None),
                )
                result.ok = True
                result.value = cur.fetchone()
                if commit:
                    hold.wait(timeout=30)
                    conn.commit()
                else:
                    conn.rollback()
            except Exception as exc:
                conn.rollback()
                result.error = str(exc)
    finally:
        conn.close()

with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as setup:
    slug, service_id, barber_id, slot = fixture(setup)

ready = threading.Barrier(2)
release_first = threading.Event()
a = Result()
b = Result()

ta = threading.Thread(
    target=book_worker,
    args=(a, slug, service_id, barber_id, slot, "Phase 23 A", "+258841" + uuid.uuid4().hex[:7], ready, release_first, True),
)
tb = threading.Thread(
    target=book_worker,
    args=(b, slug, service_id, barber_id, slot, "Phase 23 B", "+258842" + uuid.uuid4().hex[:7], ready, release_first, False),
)

ta.start()
tb.start()

# Both workers have entered the barrier. Release the first transaction only
# after the second worker has had a chance to reach the advisory lock.
release_first.set()
ta.join(45)
tb.join(45)

if ta.is_alive() or tb.is_alive():
    raise SystemExit("PHASE23_CONCURRENCY_TIMEOUT")
if a.ok == b.ok:
    raise SystemExit(f"PHASE23_CONCURRENCY_INVALID_RESULT: A={a} B={b}")

failed = b if a.ok else a
if not failed.error or ("SLOT_TAKEN" not in failed.error and "SLOT_UNAVAILABLE" not in failed.error):
    raise SystemExit(f"PHASE23_CONCURRENCY_WRONG_ERROR: {failed.error}")

# Cleanup any appointment created by the successful side.
with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as cleanup:
    with cleanup.cursor() as cur:
        cur.execute(
            "delete from public.appointments "
            "where barbershop_id=(select id from public.barbershops where slug=%s) "
            "and customer_id in (select id from public.customers where name in ('Phase 23 A','Phase 23 B'))",
            (slug,),
        )

print("PASS | Phase 23 booking concurrency: exactly one transaction succeeded and the other was rejected.")
