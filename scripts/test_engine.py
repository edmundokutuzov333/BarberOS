"""Testes de aceitação do motor (critérios 1–3) contra a barbearia 'oryon'."""
import os, threading, psycopg
from pathlib import Path
from dotenv import load_dotenv
from datetime import date, timedelta

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
DB = os.environ["DATABASE_URL"]
c = psycopg.connect(DB, autocommit=True, prepare_threshold=None)
shop = c.execute("select id, timezone from barbershops where slug='oryon'").fetchone()
sid = shop[0]

svc = c.execute("select id from services where barbershop_id=%s and name='QA Corte 40'", (sid,)).fetchone()
if not svc:
    svc = c.execute("insert into services(barbershop_id,name,price_cents,duration_min) values (%s,'QA Corte 40',50000,40) returning id", (sid,)).fetchone()
svc = svc[0]
bar = c.execute("select id from barbers where barbershop_id=%s and display_name='QA Barbeiro'", (sid,)).fetchone()
if not bar:
    bar = c.execute("insert into barbers(barbershop_id,display_name) values (%s,'QA Barbeiro') returning id", (sid,)).fetchone()
bar = bar[0]
c.execute("insert into barber_services values (%s,%s) on conflict do nothing", (bar, svc))
c.execute("delete from appointments where barber_id=%s", (bar,))
c.execute("delete from time_blocks where barber_id=%s", (bar,))

# dia útil amanhã (evita domingo)
d = date.today() + timedelta(days=1)
while d.weekday() == 6: d += timedelta(days=1)
slots = c.execute("select slot_start from get_available_slots('oryon',%s,%s,%s)", (svc, bar, d)).fetchall()
print("slots antes:", len(slots), "primeiro:", slots[0][0] if slots else None)
ten = c.execute("select (%s::text||' 10:00')::timestamp at time zone 'Africa/Maputo'", (d,)).fetchone()[0]
assert any(s[0] == ten for s in slots), "10:00 devia estar livre"

# critério 1: duas marcações simultâneas
results = []
def book(name):
    try:
        with psycopg.connect(DB, autocommit=True, prepare_threshold=None) as k:
            k.execute("select pg_sleep(0.2)")
            r = k.execute("select appointment_id from book_appointment('oryon',%s,null,%s,%s,%s,'+258841234567')", (svc, bar, ten, name)).fetchone()
            results.append(("OK", name))
    except Exception as e:
        results.append(("ERR", str(e).split("\n")[0]))
ts = [threading.Thread(target=book, args=(f"QA {i}",)) for i in range(2)]
[t.start() for t in ts]; [t.join() for t in ts]
print("critério 1:", results)
oks = [r for r in results if r[0] == "OK"]
assert len(oks) == 1 and any("SLOT" in r[1] for r in results if r[0] == "ERR"), "esperava 1 OK + 1 SLOT_*"
assert c.execute("select count(*) from appointments where barber_id=%s and status in ('pending','confirmed')", (bar,)).fetchone()[0] == 1

# critério 2: 10:15 e 10:30 desaparecem
after = {s[0] for s in c.execute("select slot_start from get_available_slots('oryon',%s,%s,%s)", (svc, bar, d)).fetchall()}
for hm in ("09:30", "09:45", "10:00", "10:15", "10:30"):
    t = c.execute("select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'", (d, hm)).fetchone()[0]
    assert t not in after, f"{hm} devia estar ocupado"
t = c.execute("select (%s::text||' 10:45')::timestamp at time zone 'Africa/Maputo'", (d,)).fetchone()[0]
assert t in after, "10:45 devia estar livre"
print("critério 2: OK (09:30–10:30 bloqueados, 10:45 livre)")

# critério 3: almoço 12:00–13:00
c.execute("insert into time_blocks(barbershop_id,barber_id,starts_at,ends_at,reason) values (%s,%s,(%s::text||' 12:00')::timestamp at time zone 'Africa/Maputo',(%s::text||' 13:00')::timestamp at time zone 'Africa/Maputo','lunch')", (sid, bar, d, d))
after = {s[0] for s in c.execute("select slot_start from get_available_slots('oryon',%s,%s,%s)", (svc, bar, d)).fetchall()}
for hm in ("11:30", "11:45", "12:00", "12:30", "12:45"):
    t = c.execute("select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'", (d, hm)).fetchone()[0]
    assert t not in after, f"{hm} devia estar bloqueado pelo almoço"
for hm in ("11:15", "13:00"):
    t = c.execute("select (%s::text||' '||%s)::timestamp at time zone 'Africa/Maputo'", (d, hm)).fetchone()[0]
    assert t in after, f"{hm} devia estar livre"
print("critério 3: OK (11:30–12:45 bloqueados, 11:15 e 13:00 livres)")

days = c.execute("select day, slots_count, is_open from get_available_days('oryon',%s,%s)", (svc, bar)).fetchall()
print("get_available_days:", [(str(x[0]), x[1], x[2]) for x in days[:4]])
n = c.execute("select count(*) from notifications where appointment_id in (select id from appointments where barber_id=%s)", (bar,)).fetchone()[0]
print("notificações enfileiradas:", n)

# limpeza
c.execute("delete from notifications where appointment_id in (select id from appointments where barber_id=%s)", (bar,))
c.execute("delete from appointments where barber_id=%s", (bar,))
c.execute("delete from time_blocks where barber_id=%s", (bar,))
c.execute("delete from barbers where id=%s", (bar,))
c.execute("delete from services where id=%s", (svc,))
c.execute("delete from customers where barbershop_id=%s and phone='+258841234567'", (sid,))
print("TUDO OK")
