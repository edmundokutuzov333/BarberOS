"""BarberOS engine RPC tests.

Credentials and the test shop are supplied by the test environment. Nothing
sensitive is stored in source control.
"""
import os
import time
import uuid
from datetime import date, timedelta, datetime

import pytest
import requests

SUPABASE_URL = os.getenv("BARBEROS_TEST_SUPABASE_URL") or os.getenv("SUPABASE_URL")
ANON_KEY = os.getenv("BARBEROS_TEST_SUPABASE_PUBLISHABLE_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY")
OWNER_EMAIL = os.getenv("BARBEROS_TEST_EMAIL")
OWNER_PASS = os.getenv("BARBEROS_TEST_PASSWORD")
SLUG = os.getenv("BARBEROS_TEST_SHOP_SLUG", "oryon")

if not SUPABASE_URL or not ANON_KEY:
    pytest.skip(
        "Teste de integração requer BARBEROS_TEST_SUPABASE_URL e "
        "BARBEROS_TEST_SUPABASE_PUBLISHABLE_KEY.",
        allow_module_level=True,
    )

REST = f"{SUPABASE_URL}/rest/v1"
AUTH = f"{SUPABASE_URL}/auth/v1"


def _hdr(tok=None):
    token = tok or ANON_KEY
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


@pytest.fixture(scope="module")
def owner_token():
    if not OWNER_EMAIL or not OWNER_PASS:
        pytest.skip(
            "Owner test credentials not configured. Set BARBEROS_TEST_EMAIL "
            "and BARBEROS_TEST_PASSWORD outside the repository."
        )
    r = requests.post(
        f"{AUTH}/token?grant_type=password",
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        json={"email": OWNER_EMAIL, "password": OWNER_PASS},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def shop_id(owner_token):
    r = requests.get(
        f"{REST}/barbershops?slug=eq.{SLUG}&select=id",
        headers=_hdr(owner_token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json(), f"shop {SLUG!r} not found"
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def service_id(owner_token, shop_id):
    r = requests.get(
        f"{REST}/services?barbershop_id=eq.{shop_id}&name=eq.QA%20Corte&select=id",
        headers=_hdr(owner_token),
        timeout=15,
    )
    if r.status_code == 200 and r.json():
        return r.json()[0]["id"]

    r = requests.post(
        f"{REST}/services",
        headers=_hdr(owner_token),
        json={
            "barbershop_id": shop_id,
            "name": "QA Corte",
            "price_cents": 35000,
            "duration_min": 30,
            "is_active": True,
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def barber_id(owner_token, shop_id, service_id):
    r = requests.get(
        f"{REST}/barbers?barbershop_id=eq.{shop_id}&display_name=eq.QA%20Nelson&select=id",
        headers=_hdr(owner_token),
        timeout=15,
    )
    if r.status_code == 200 and r.json():
        bid = r.json()[0]["id"]
    else:
        r = requests.post(
            f"{REST}/barbers",
            headers=_hdr(owner_token),
            json={
                "barbershop_id": shop_id,
                "display_name": "QA Nelson",
                "years_experience": 5,
                "is_active": True,
            },
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        bid = r.json()[0]["id"]

    r = requests.post(
        f"{REST}/barber_services",
        headers={**_hdr(owner_token), "Prefer": "resolution=ignore-duplicates"},
        json={"barber_id": bid, "service_id": service_id},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    return bid


def _next_weekday(from_date=None):
    d = (from_date or date.today()) + timedelta(days=1)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


class TestEngineRPC:
    def test_get_available_days_anon(self, service_id):
        r = requests.post(
            f"{REST}/rpc/get_available_days",
            headers=_hdr(),
            json={
                "p_slug": SLUG,
                "p_service_id": service_id,
                "p_barber_id": None,
                "p_from": date.today().isoformat(),
                "p_to": (date.today() + timedelta(days=30)).isoformat(),
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows
        sundays = [x for x in rows if datetime.fromisoformat(x["day"]).weekday() == 6]
        assert sundays
        assert all(s["is_open"] is False for s in sundays)

    def test_get_available_slots_anon(self, service_id, barber_id):
        d = _next_weekday()
        r = requests.post(
            f"{REST}/rpc/get_available_slots",
            headers=_hdr(),
            json={
                "p_slug": SLUG,
                "p_service_id": service_id,
                "p_barber_id": None,
                "p_date": d.isoformat(),
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        slots = r.json()
        assert isinstance(slots, list) and slots
        assert any(barber_id in (s.get("barber_ids") or []) for s in slots)

    def test_book_appointment_flow(self, service_id, barber_id):
        d = _next_weekday()
        r = requests.post(
            f"{REST}/rpc/get_available_slots",
            headers=_hdr(),
            json={
                "p_slug": SLUG,
                "p_service_id": service_id,
                "p_barber_id": None,
                "p_date": d.isoformat(),
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        slots = [s for s in r.json() if barber_id in (s.get("barber_ids") or [])]
        assert slots
        chosen = slots[0]["slot_start"]

        payload = {
            "p_slug": SLUG,
            "p_service_id": service_id,
            "p_haircut_id": None,
            "p_barber_id": barber_id,
            "p_start": chosen,
            "p_name": f"QA Cliente {uuid.uuid4().hex[:6]}",
            "p_phone": f"+25884{int(time.time()) % 1000000:06d}",
            "p_email": None,
        }
        r = requests.post(
            f"{REST}/rpc/book_appointment", headers=_hdr(), json=payload, timeout=20
        )
        assert r.status_code == 200, r.text
        body = r.json()
        row = body[0] if isinstance(body, list) else body
        assert row.get("appointment_id")
        assert row.get("manage_token")

    def test_book_invalid_phone(self, service_id):
        d = _next_weekday()
        r = requests.post(
            f"{REST}/rpc/get_available_slots",
            headers=_hdr(),
            json={
                "p_slug": SLUG,
                "p_service_id": service_id,
                "p_barber_id": None,
                "p_date": d.isoformat(),
            },
            timeout=20,
        )
        slots = r.json()
        if not slots:
            pytest.skip("no available slot")

        payload = {
            "p_slug": SLUG,
            "p_service_id": service_id,
            "p_haircut_id": None,
            "p_barber_id": None,
            "p_start": slots[-1]["slot_start"],
            "p_name": "QA Cliente",
            "p_phone": "123",
            "p_email": None,
        }
        r = requests.post(
            f"{REST}/rpc/book_appointment", headers=_hdr(), json=payload, timeout=20
        )
        assert r.status_code >= 400
        assert "INVALID_PHONE" in r.text.upper()
