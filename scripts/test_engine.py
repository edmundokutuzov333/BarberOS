"""Acceptance tests for an isolated BarberOS test database.

This script is deliberately unable to fall back to production.
"""
import os
import threading
from datetime import date, timedelta

import psycopg

database_url = os.getenv("BARBEROS_TEST_DATABASE_URL")
if not database_url:
    raise SystemExit("BARBEROS_TEST_DATABASE_URL não definido.")

if os.getenv("BARBEROS_TEST_ALLOW_MUTATION") != "1":
    raise SystemExit(
        "Teste mutável recusado. Use uma base isolada e defina "
        "BARBEROS_TEST_ALLOW_MUTATION=1."
    )

slug = os.getenv("BARBEROS_TEST_SHOP_SLUG", "oryon")

with psycopg.connect(database_url, autocommit=True, prepare_threshold=None) as c:
    shop = c.execute(
        "select id, timezone from public.barbershops where slug=%s", (slug,)
    ).fetchone()
    if not shop:
        raise SystemExit("Barbearia de teste não encontrada.")

    sid = shop[0]

    svc = c.execute(
        "select id from public.services where barbershop_id=%s and name='QA Corte 40'",
        (sid,),
    ).fetchone()
    if not svc:
        svc = c.execute(
            """
            insert into public.services(barbershop_id,name,price_cents,duration_min)
            values (%s,'QA Corte 40',50000,40)
            returning id
            """,
            (sid,),
        ).fetchone()
    svc = svc[0]

    bar = c.execute(
        "select id from public.barbers where barbershop_id=%s and display_name='QA Barbeiro'",
        (sid,),
    ).fetchone()
    if not bar:
        bar = c.execute(
            "insert into public.barbers(barbershop_id,display_name) values (%s,'QA Barbeiro') returning id",
            (sid,),
        ).fetchone()
    bar = bar[0]

    c.execute(
        "insert into public.barber_services values (%s,%s) on conflict do nothing",
        (bar, svc),
    )

    d = date.today() + timedelta(days=1)
    while d.weekday() == 6:
        d += timedelta(days=1)

    slots = c.execute(
        "select slot_start from public.get_available_slots(%s,%s,%s,%s)",
        (slug, svc, bar, d),
    ).fetchall()

    ten = c.execute(
        "select (%s::text||' 10:00')::timestamp at time zone 'Africa/Maputo'",
        (d,),
    ).fetchone()[0]
    assert any(s[0] == ten for s in slots), "10:00 devia estar livre"

    results = []

    def book(name: str):
        try:
            with psycopg.connect(
                database_url, autocommit=True, prepare_threshold=None
            ) as k:
                k.execute("select pg_sleep(0.2)")
                k.execute(
                    """
                    select appointment_id
                    from public.book_appointment(
                        %s,%s,null,%s,%s,%s,'+258841234567'
                    )
                    """,
                    (slug, svc, bar, ten, name),
                ).fetchone()
                results.append(("OK", name))
        except Exception as exc:
            results.append(("ERR", str(exc).split("\n")[0]))

    threads = [threading.Thread(target=book, args=(f"QA {i}",)) for i in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    oks = [result for result in results if result[0] == "OK"]
    assert len(oks) == 1 and any(
        "SLOT" in result[1] for result in results if result[0] == "ERR"
    )

    after = {
        s[0]
        for s in c.execute(
            "select slot_start from public.get_available_slots(%s,%s,%s,%s)",
            (slug, svc, bar, d),
        ).fetchall()
    }

    for hm in ("09:30", "09:45", "10:00", "10:15", "10:30"):
        t = c.execute(
            "select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'",
            (d, hm),
        ).fetchone()[0]
        assert t not in after, f"{hm} devia estar ocupado"

    t = c.execute(
        "select (%s::text||' 10:45')::timestamp at time zone 'Africa/Maputo'",
        (d,),
    ).fetchone()[0]
    assert t in after, "10:45 devia estar livre"

    c.execute(
        """
        insert into public.time_blocks(
            barbershop_id,barber_id,starts_at,ends_at,reason
        )
        values (
            %s,%s,
            (%s::text||' 12:00')::timestamp at time zone 'Africa/Maputo',
            (%s::text||' 13:00')::timestamp at time zone 'Africa/Maputo',
            'lunch'
        )
        """,
        (sid, bar, d, d),
    )

    after = {
        s[0]
        for s in c.execute(
            "select slot_start from public.get_available_slots(%s,%s,%s,%s)",
            (slug, svc, bar, d),
        ).fetchall()
    }

    for hm in ("11:30", "11:45", "12:00", "12:30", "12:45"):
        t = c.execute(
            "select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'",
            (d, hm),
        ).fetchone()[0]
        assert t not in after, f"{hm} devia estar bloqueado pelo almoço"

    for hm in ("11:15", "13:00"):
        t = c.execute(
            "select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'",
            (d, hm),
        ).fetchone()[0]
        assert t in after, f"{hm} devia estar livre"

    print("BARBEROS TEST ENGINE: PASS")

    c.execute(
        "delete from public.notifications where appointment_id in (select id from public.appointments where barber_id=%s)",
        (bar,),
    )
    c.execute("delete from public.appointments where barber_id=%s", (bar,))
    c.execute("delete from public.time_blocks where barber_id=%s", (bar,))
    c.execute("delete from public.barbers where id=%s", (bar,))
    c.execute("delete from public.services where id=%s", (svc,))
    c.execute(
        "delete from public.customers where barbershop_id=%s and phone='+258841234567'",
        (sid,),
    )
