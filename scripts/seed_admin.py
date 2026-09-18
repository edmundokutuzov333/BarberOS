"""Provision a platform administrator in a controlled environment.

This script requires a server-side Supabase secret API key and an explicit
safety flag. Never place either value in the repository.
"""
import json
import os
import sys
import urllib.error
import urllib.request

import psycopg


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} não definido.")
    return value


if os.getenv("BARBEROS_ALLOW_ADMIN_SEED") != "1":
    raise SystemExit(
        "Execução recusada. Defina BARBEROS_ALLOW_ADMIN_SEED=1 explicitamente."
    )

url = required("SUPABASE_URL")
key = required("SUPABASE_SECRET_KEY")
database_url = required("DATABASE_URL")

if not key.startswith("sb_secret_"):
    raise SystemExit("SUPABASE_SECRET_KEY deve ser uma secret API key sb_secret_*.")

if len(sys.argv) < 3:
    raise SystemExit(
        "Uso: python3 scripts/seed_admin.py EMAIL PASSWORD [NOME] [SLUG]"
    )

email, password = sys.argv[1], sys.argv[2]
name = sys.argv[3] if len(sys.argv) > 3 else "Administrador"
slug = sys.argv[4] if len(sys.argv) > 4 else None


def api(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        f"{url}/auth/v1{path}",
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        return {"error": exc.read().decode()}


with psycopg.connect(database_url, prepare_threshold=None) as conn:
    row = conn.execute(
        "select id from auth.users where email=%s",
        (email,),
    ).fetchone()

    if row:
        uid = str(row[0])
        api(
            "PUT",
            f"/admin/users/{uid}",
            {"password": password, "email_confirm": True},
        )
    else:
        res = api(
            "POST",
            "/admin/users",
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": name},
            },
        )
        if "id" not in res:
            print("ERR", res)
            sys.exit(1)
        uid = res["id"]

    conn.execute(
        """
        insert into public.profiles(id, full_name, is_platform_admin)
        values (%s, %s, true)
        on conflict (id) do update
        set is_platform_admin=true,
            full_name=coalesce(public.profiles.full_name, excluded.full_name)
        """,
        (uid, name),
    )

    if slug:
        shop = conn.execute(
            "select id from public.barbershops where slug=%s",
            (slug,),
        ).fetchone()

        if not shop:
            plan = conn.execute(
                "select id from public.plans where code='pro'"
            ).fetchone()
            if not plan:
                raise SystemExit("Plano 'pro' não encontrado.")

            shop = conn.execute(
                """
                insert into public.barbershops(
                    name, slug, phone, whatsapp, plan_id, status, address
                )
                values (
                    'Barbearia Oryon', %s, '+258840000000', '+258840000000',
                    %s, 'active', 'Maputo'
                )
                returning id
                """,
                (slug, plan[0]),
            ).fetchone()

            conn.execute(
                """
                insert into public.working_hours(
                    barbershop_id, weekday, opens_at, closes_at, is_closed
                )
                select %s, d, '09:00', '19:00', d=0
                from generate_series(0,6) d
                """,
                (shop[0],),
            )

        conn.execute(
            """
            insert into public.barbershop_members(barbershop_id,user_id,role)
            values (%s,%s,'owner')
            on conflict do nothing
            """,
            (shop[0], uid),
        )

    conn.commit()
    print("OK", uid)
