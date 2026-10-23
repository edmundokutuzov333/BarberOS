"""Safety checks shared by mutable BarberOS acceptance runners."""

from __future__ import annotations

from urllib.parse import unquote

PRODUCTION_PROJECT_REF = "alseiinjzwjdiwtvkdzy"


def require_isolated_test_database(database_url: str | None) -> str:
    """Require a test DSN and refuse the known production Supabase project.

    The project reference appears in standard direct-connection hostnames and in
    Supavisor usernames. Decode URL-escaped DSNs before checking. This guard is
    deliberately conservative: if the production project reference is present
    anywhere in the DSN, the test runner aborts before connecting.
    """
    if not database_url or not database_url.strip():
        raise SystemExit(
            "REQUIRED_TEST_ENV_MISSING: BARBEROS_TEST_DATABASE_URL não definido; "
            "a suite de aceitação não pode ser considerada aprovada."
        )

    if PRODUCTION_PROJECT_REF in unquote(database_url).lower():
        raise SystemExit(
            "REFUSED_PRODUCTION_DATABASE_URL: BARBEROS_TEST_DATABASE_URL referencia "
            "o projecto Supabase de produção; nenhum teste mutável foi iniciado."
        )

    return database_url
