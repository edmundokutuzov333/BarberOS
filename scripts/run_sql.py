"""Run explicit SQL only against a controlled environment.

Production database changes must go through Supabase migrations. This script
requires an explicit safety flag and never loads a repository .env file.
"""
import glob
import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise SystemExit("DATABASE_URL não definido.")

if os.getenv("BARBEROS_ALLOW_SQL_SCRIPT") != "1":
    raise SystemExit(
        "Execução recusada. Use Supabase migrations para produção ou defina "
        "BARBEROS_ALLOW_SQL_SCRIPT=1 explicitamente num ambiente controlado."
    )

files = sys.argv[1:] or sorted(
    glob.glob(str(ROOT / "supabase" / "migrations" / "*.sql"))
)
if not files:
    raise SystemExit("Nenhum ficheiro SQL encontrado.")

with psycopg.connect(database_url, autocommit=False, prepare_threshold=None) as conn:
    for filename in files:
        path = Path(filename)
        sql = path.read_text(encoding="utf-8")
        try:
            conn.execute(sql)
            conn.commit()
            print("OK ", path.name)
        except Exception as exc:
            conn.rollback()
            print("ERR", path.name, "->", exc)
            sys.exit(1)
