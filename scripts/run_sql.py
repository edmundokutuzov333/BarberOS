"""Corre ficheiros SQL da pasta supabase/migrations contra o Postgres do Supabase.
Uso: python3 scripts/run_sql.py [ficheiro.sql ...]  (sem args: corre todos por ordem)"""
import os, sys, glob, psycopg
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")
url = os.environ["DATABASE_URL"]
files = sys.argv[1:] or sorted(glob.glob(str(Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "*.sql")))

with psycopg.connect(url, autocommit=False, prepare_threshold=None) as conn:
    for f in files:
        sql = Path(f).read_text()
        try:
            conn.execute(sql)
            conn.commit()
            print("OK ", Path(f).name)
        except Exception as e:
            conn.rollback()
            print("ERR", Path(f).name, "->", e)
            sys.exit(1)
