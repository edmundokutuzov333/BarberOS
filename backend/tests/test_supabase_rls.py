"""RLS/PostgREST tests against Supabase for BarberOS.

We validate that anonymous access is restricted (RLS deny) and that a
freshly registered user cannot see the pre-seeded 'oryon' barbershop
data across appointments / barbershop_members.
"""

import os
import time
import uuid
import requests
import pytest

SUPABASE_URL = "https://alseiinjzwjdiwtvkdzy.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsc2VpaW5qendqZGl3dHZrZHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTE5NjUsImV4cCI6MjEwNTI4Nzk2NX0."
    "vTpVIK2DjBLcZiRa3fAKXyq-0zUnWfufxLCSwPAd_pk"
)

REST = f"{SUPABASE_URL}/rest/v1"
AUTH = f"{SUPABASE_URL}/auth/v1"

ANON_HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}


# ---------- anon (unauthenticated) tests ----------

def test_anon_insert_appointment_forbidden():
    r = requests.post(
        f"{REST}/appointments",
        headers=ANON_HEADERS,
        json={"barbershop_id": "00000000-0000-0000-0000-000000000000"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"


def test_anon_select_appointments_empty():
    r = requests.get(f"{REST}/appointments?select=id", headers=ANON_HEADERS, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_anon_select_customers_empty():
    r = requests.get(f"{REST}/customers?select=id", headers=ANON_HEADERS, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json() == []


def test_anon_select_barbershops_oryon_active():
    r = requests.get(
        f"{REST}/barbershops?select=slug,status", headers=ANON_HEADERS, timeout=15
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    oryon = [row for row in rows if row.get("slug") == "oryon"]
    assert oryon, f"oryon shop not found in public list: {rows}"
    assert oryon[0]["status"] == "active"


# ---------- authenticated new-user tests ----------

@pytest.fixture(scope="module")
def new_user_token():
    email = f"qa+{int(time.time())}-{uuid.uuid4().hex[:6]}@barberos-test.mz"
    password = "TestPass#2026"
    # Sign up
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
        # try password grant (in case signup requires confirm but returned user)
        r2 = requests.post(
            f"{AUTH}/token?grant_type=password",
            headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
            json={"email": email, "password": password},
            timeout=20,
        )
        if r2.status_code == 200:
            token = r2.json().get("access_token")
    if not token:
        pytest.skip(f"Signup requires email confirmation, no session. body={body}")
    return {"email": email, "token": token}


def _auth_headers(tok):
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {tok}",
        "Content-Type": "application/json",
    }


def test_new_user_barbershop_members_only_own(new_user_token):
    r = requests.get(
        f"{REST}/barbershop_members?select=user_id,barbershop_id",
        headers=_auth_headers(new_user_token["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    # New user has no memberships yet -> should be empty
    assert rows == [], f"Expected [], got {rows}"


def test_new_user_cannot_see_oryon_appointments(new_user_token):
    r = requests.get(
        f"{REST}/appointments?select=id,barbershop_id",
        headers=_auth_headers(new_user_token["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    # Should not see any appointments from oryon
    assert rows == [], f"Leak: {rows}"
