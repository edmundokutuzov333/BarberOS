"""Test concurrent booking with its own isolated test tenant.

Requires BARBEROS_TEST_DATABASE_URL pointing only to a dedicated test database.
The fixture is created and removed by this script; it does not depend on seed.sql.
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass

import psycopg
from database_safety import require_isolated_test_database

DB = require_isolated_test_database(os.getenv("BARBEROS_TEST_DATABASE_URL"))
if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit("REFUSED: BARBEROS_TEST_ALLOW_MUTATION=1 é obrigatório.")


@dataclass
class Result:
    ok: bool = False
    value: object | None = None
    error: str | None = None


def make_fixture(conn):
    slug = "phase23-race-" + uuid.uuid4().hex[:12]
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """insert into public.barbershops
                   (slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
                   values (%s,%s,'active','Africa/Maputo',0,30,15) returning id""",
                (slug, "BarberOS Phase 23 Concurrency Fixture"),
            )
            shop_id = cur.fetchone()[0]
            cur.execute(
                "insert into public.barbers(display_name,barbershop_id,is_active) values (%s,%s,true) returning id",
                ("Barbeiro Phase 23 " + slug[-6:], shop_id),
            )
            barber_id = cur.fetchone()[0]
            cur.execute(
                """insert into public.services
                   (barbershop_id,name,price_cents,duration_min,is_active,sort_order)
                   values (%s,%s,12000,30,true,0) returning id""",
                (shop_id, "Serviço Phase 23 " + slug[-6:]),
            )
            service_id = cur.fetchone()[0]
            cur.execute(
                "insert into public.barber_services(barber_id,service_id) values (%s,%s)",
                (barber_id, service_id),
            )
            cur.execute(
                """insert into public.working_hours
                   (barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed)
                   select %s,%s,d,time '00:00',time '23:59',false from generate_series(0,6) d""",
                (shop_id, barber_id),
            )
            cur.execute(
                """insert into public.working_hours
                   (barbershop_id,barber_id,weekday,opens_at,closes_at,is_closed)
                   select %s,null,d,time '00:00',time '23:59',false from generate_series(0,6) d""",
                (shop_id,),
            )
            cur.execute("select ((now() at time zone 'Africa/Maputo')::date + 1)")
            test_day = cur.fetchone()[0]
            cur.execute(
                """select slot_start from public.get_available_slots(%s,%s,%s,%s)
                   where slot_start > now()+interval '20 minutes'
                   order by slot_start limit 1""",
                (slug, service_id, barber_id, test_day),
            )
            slot_row = cur.fetchone()
            if not slot_row:
                raise RuntimeError("PHASE23_CONCURRENCY_SLOT_UNAVAILABLE")
    return shop_id, slug, service_id, barber_id, slot_row[0]


def book_worker(result, started, release_commit, slug, service_id, barber_id, slot, name, phone, app_name):
    conn = psycopg.connect(DB, autocommit=False, prepare_threshold=None, application_name=app_name)
    try:
        with conn.cursor() as cur:
            started.set()
            cur.execute(
                "select public.book_appointment(%s,%s,%s,%s,%s,%s,%s,%s)",
                (slug, service_id, None, barber_id, slot, name, phone, None),
            )
            result.value = cur.fetchone()
            result.ok = True
            release_commit.wait(timeout=30)
            conn.commit()
    except Exception as exc:
        conn.rollback()
        result.error = str(exc)
    finally:
        conn.close()


def wait_until_blocked(conn, app_name, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with conn.cursor() as cur:
            cur.execute(
                """select exists(
                     select 1 from pg_stat_activity
                     where application_name=%s and state='active' and wait_event_type='Lock'
                       and query ilike '%book_appointment%'
                   )""",
                (app_name,),
            )
            if cur.fetchone()[0]:
                return True
        time.sleep(0.05)
    return False


shop_id = None
release_a = threading.Event()
ta = tb = None
try:
    with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as setup:
        shop_id, slug, service_id, barber_id, slot = make_fixture(setup)

    a, b = Result(), Result()
    a_started, b_started = threading.Event(), threading.Event()
    ta = threading.Thread(
        target=book_worker,
        args=(a,a_started,release_a,slug,service_id,barber_id,slot,
              "Phase 23 A","+25884"+str(uuid.uuid4().int)[:7],"barberos-phase23-a"),
    )
    ta.start()
    if not a_started.wait(10):
        raise SystemExit("PHASE23_CONCURRENCY_A_START_TIMEOUT")
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not a.ok and not a.error:
        time.sleep(0.02)
    if not a.ok:
        raise SystemExit(f"PHASE23_CONCURRENCY_A_FAILED: {a.error}")

    tb = threading.Thread(
        target=book_worker,
        args=(b,b_started,release_a,slug,service_id,barber_id,slot,
              "Phase 23 B","+25885"+str(uuid.uuid4().int)[:7],"barberos-phase23-b"),
    )
    tb.start()
    if not b_started.wait(10):
        raise SystemExit("PHASE23_CONCURRENCY_B_START_TIMEOUT")
    with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as monitor:
        if not wait_until_blocked(monitor, "barberos-phase23-b", timeout=10):
            release_a.set()
            tb.join(45)
            raise SystemExit("PHASE23_CONCURRENCY_B_DID_NOT_WAIT_ON_SLOT_LOCK")

    release_a.set()
    ta.join(45)
    tb.join(45)
    if ta.is_alive() or tb.is_alive():
        raise SystemExit("PHASE23_CONCURRENCY_TIMEOUT")
    if a.ok == b.ok:
        raise SystemExit(f"PHASE23_CONCURRENCY_INVALID_RESULT: A={a} B={b}")
    failed = b if a.ok else a
    if not failed.error or ("SLOT_TAKEN" not in failed.error and "SLOT_UNAVAILABLE" not in failed.error):
        raise SystemExit(f"PHASE23_CONCURRENCY_WRONG_ERROR: {failed.error}")
    print("PASS | Phase 23 concurrency: one booking committed, the concurrent booking was rejected.")
finally:
    release_a.set()
    if ta is not None:
        ta.join(5)
    if tb is not None:
        tb.join(5)
    if shop_id:
        with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as cleanup:
            with cleanup.cursor() as cur:
                cur.execute("delete from public.barbershops where id=%s", (shop_id,))
