"""Contract tests for the isolated-database safety guard."""

from __future__ import annotations

from database_safety import require_isolated_test_database


def must_refuse(database_url: str | None, expected: str) -> None:
    try:
        require_isolated_test_database(database_url)
    except SystemExit as exc:
        if expected not in str(exc):
            raise AssertionError(f"Unexpected refusal reason: {exc}") from exc
    else:
        raise AssertionError("Unsafe or missing database URL was accepted")


def main() -> None:
    must_refuse(None, "REQUIRED_TEST_ENV_MISSING")
    must_refuse("", "REQUIRED_TEST_ENV_MISSING")
    must_refuse(
        "postgresql://postgres@db.alseiinjzwjdiwtvkdzy.supabase.co:5432/postgres",
        "REFUSED_PRODUCTION_DATABASE_URL",
    )
    must_refuse(
        "postgresql://postgres.alseiinjzwjdiwtvkdzy@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
        "REFUSED_PRODUCTION_DATABASE_URL",
    )
    must_refuse(
        "postgresql://postgres@pooler.example.invalid:5432/postgres?options=project%3Dalseiinjzwjdiwtvkdzy",
        "REFUSED_PRODUCTION_DATABASE_URL",
    )

    staging_url = "postgresql://postgres.asikuyxaapcmayptimxi@pooler.example.invalid:5432/postgres"
    assert require_isolated_test_database(staging_url) == staging_url
    print("PASS | database safety guard rejects missing/production DSNs and accepts a staging-shaped DSN")


if __name__ == "__main__":
    main()
