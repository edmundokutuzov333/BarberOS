"""Cria/actualiza a conta do administrador da plataforma e uma barbearia de demonstração."""
import os, sys, json, urllib.request, psycopg
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
URL, KEY, DB = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"], os.environ["DATABASE_URL"]
EMAIL, PASSWORD, NAME = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Administrador"
SLUG = sys.argv[4] if len(sys.argv) > 4 else None

def api(method, path, body=None):
    req = urllib.request.Request(f"{URL}/auth/v1{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()}

with psycopg.connect(DB, prepare_threshold=None) as conn:
    row = conn.execute("select id from auth.users where email=%s", (EMAIL,)).fetchone()
    if row:
        uid = str(row[0])
        api("PUT", f"/admin/users/{uid}", {"password": PASSWORD, "email_confirm": True})
    else:
        res = api("POST", "/admin/users", {"email": EMAIL, "password": PASSWORD, "email_confirm": True,
                                            "user_metadata": {"full_name": NAME}})
        if "id" not in res: print("ERR", res); sys.exit(1)
        uid = res["id"]
    conn.execute("insert into profiles(id,full_name,is_platform_admin) values (%s,%s,true) "
                 "on conflict (id) do update set is_platform_admin=true, full_name=coalesce(profiles.full_name,excluded.full_name)", (uid, NAME))
    if SLUG:
        shop = conn.execute("select id from barbershops where slug=%s", (SLUG,)).fetchone()
        if not shop:
            plan = conn.execute("select id from plans where code='pro'").fetchone()[0]
            shop = conn.execute("insert into barbershops(name,slug,phone,whatsapp,plan_id,status,address) values "
                                "('Barbearia Oryon',%s,'+258840000000','+258840000000',%s,'active','Av. Julius Nyerere, Maputo') returning id", (SLUG, plan)).fetchone()
            conn.execute("insert into working_hours(barbershop_id,weekday,opens_at,closes_at,is_closed) "
                         "select %s,d,'09:00','19:00',d=0 from generate_series(0,6) d", (shop[0],))
        conn.execute("insert into barbershop_members(barbershop_id,user_id,role) values (%s,%s,'owner') on conflict do nothing", (shop[0], uid))
    conn.commit()
    print("OK", uid)
