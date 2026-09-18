"""Supabase RLS tests using environment-provided test credentials."""
import os
import time
import uuid

import pytest
import requests

SUPABASE_URL = os.getenv("BARBEROS_TEST_SUPABASE_URL") or os.getenv("SUPABASE_URL")
ANON_KEY = os.getenv("BARBEROS_TEST_SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY")

if not SUPABASE_URL or not ANON_KEY:
    pytest.skip(
        "RLS tests require BARBEROS_TEST_SUPABASE_URL and "
        "BARBEROS_TEST_SUPABASE_PUBLISHABLE_KEY.",
        allow_module_level=True,
    )

REST = f"{SUPABASE_URL}/rest/v1"
AUTH = f"{SUPABASE_URL}/auth/v1"
ANON_HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}


def test_anon_insert_appointment_forbidden():
    r = requests.post(
        f"{REST}/appointments",
        headers=ANON_HEADERS,
        json={"barbershop_id": "00000000-0000-0000-0000-000000000000"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"{r.status_code}: {r.text}"


def test_anon_select_appointments_empty():
    r = requests.get(
        f"{REST}/appointments?select=id", headers=ANON_HEADERS, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_anon_select_customers_empty():
    r = requests.get(
        f"{REST}/customers?select=id", headers=ANON_HEADERS, timeout=15
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_anon_select_barbershops_public():
    r = requests.get(
        f"{REST}/barbershops?select=slug,status", headers=ANON_HEADERS, timeout=15
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


@pytest.fixture(scope="module")
def new_user_token():
    email = f"qa+{int(time.time())}-{uuid.uuid4().hex[:6]}@barberos-test.mz"
    password = os.getenv("BARBEROS_TEST_NEW_USER_PASSWORD")
    if not password:
        pytest.skip("BARBEROS_TEST_NEW_USER_PASSWORD não definido.")

    r = requests.post(
        f"{AUTH}/signup",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=20,
    )
    if r.status_code not in (200, 201):
        pytest.skip(f"signup failed: {r.status_code} {r.text}")

    body = r.json()
    token = body.get("access_token")
    if not token:
        r2 = requests.post(
            f"{AUTH}/token?grant_type=password",
            headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=20,
        )
        if r2.status_code == 200:
            token = r2.json().get("access_token")
    if not token:
        pytest.skip("Signup requires email confirmation.")
    return token


def _auth_headers(token):
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def test_new_user_barbershop_members_only_own(new_user_token):
    r = requests.get(
        f"{REST}/barbershop_members?select=user_id,barbershop_id",
        headers=_auth_headers(new_user_token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_new_user_cannot_see_oryon_appointments(new_user_token):
    r = requests.get(
        f"{REST}/appointments?select=id,barbershop_id",
        headers=_auth_headers(new_user_token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json() == []
