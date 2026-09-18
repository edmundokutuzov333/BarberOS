"""BarberOS - Engine RPC tests via PostgREST (anon + owner).

Covers:
- Owner login and setup of QA service + QA barber for barbershop 'oryon'.
- Public RPCs get_available_days, get_available_slots.
- book_appointment success + SLOT_UNAVAILABLE/TAKEN + INVALID_PHONE.
"""
import os
import time
import requests
import pytest
from datetime import date, timedelta, datetime

SUPABASE_URL = "https://alseiinjzwjdiwtvkdzy.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsc2VpaW5qendqZGl3dHZrZHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTE5NjUsImV4cCI6MjEwNTI4Nzk2NX0."
    "vTpVIK2DjBLcZiRa3fAKXyq-0zUnWfufxLCSwPAd_pk"
)
REST = f"{SUPABASE_URL}/rest/v1"
AUTH = f"{SUPABASE_URL}/auth/v1"

OWNER_EMAIL = "contact@edmundokutuzov.art"
OWNER_PASS = "Oryon#2026!"
SLUG = "oryon"


def _hdr(tok=None):
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {tok or ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


@pytest.fixture(scope="module")
def owner_token():
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
    assert r.json(), "oryon shop not found"
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def service_id(owner_token, shop_id):
    # Get or create 'QA Corte' service
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
    # link barber<->service
    requests.post(
        f"{REST}/barber_services",
        headers={**_hdr(owner_token), "Prefer": "resolution=ignore-duplicates"},
        json={"barber_id": bid, "service_id": service_id},
        timeout=15,
    )
    return bid


def _next_weekday(from_date=None):
    d = (from_date or date.today()) + timedelta(days=1)
    while d.weekday() == 6:  # Sunday closed
        d += timedelta(days=1)
    return d


class TestEngineRPC:
    def test_get_available_days_anon(self, service_id):
        r = requests.post(
            f"{REST}/rpc/get_available_days",
            headers=_hdr(),
            json={"p_slug": SLUG, "p_service_id": service_id},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and rows, "empty days"
        # Sunday must be closed
        sundays = [x for x in rows if datetime.fromisoformat(x["day"]).weekday() == 6]
        assert sundays, "no sunday in horizon"
        assert all(s["is_open"] is False for s in sundays), f"sunday open: {sundays}"

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
        assert isinstance(slots, list) and slots, f"no slots for {d}"
        # QA Nelson barber must appear in at least one slot's barber_ids
        assert any(
            barber_id in (s.get("barber_ids") or []) for s in slots
        ), f"barber_id not in any slot: sample={slots[:2]}"

    def test_book_appointment_flow(self, service_id, barber_id):
        d = _next_weekday()
        # get a slot
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
        assert slots, "no slot for QA Nelson"
        chosen = slots[0]["slot_start"]

        payload = {
            "p_slug": SLUG,
            "p_service_id": service_id,
            "p_haircut_id": None,
            "p_barber_id": None,
            "p_start": chosen,
            "p_name": "QA Cliente",
            "p_phone": "+258841112233",
        }
        r = requests.post(
            f"{REST}/rpc/book_appointment", headers=_hdr(), json=payload, timeout=20
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Supabase returns list or single row
        row = body[0] if isinstance(body, list) else body
        assert row.get("appointment_id"), f"no appointment_id: {body}"
        assert row.get("manage_token"), f"no manage_token: {body}"

        # Booking the same slot again should fail
        r2 = requests.post(
            f"{REST}/rpc/book_appointment", headers=_hdr(), json=payload, timeout=20
        )
        assert r2.status_code >= 400, f"expected error second time, got {r2.status_code} {r2.text}"
        msg = r2.text.upper()
        assert ("SLOT_UNAVAILABLE" in msg) or ("SLOT_TAKEN" in msg), f"unexpected err: {r2.text}"

    def test_book_invalid_phone(self, service_id, barber_id):
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
        slots = [s for s in r.json() if barber_id in (s.get("barber_ids") or [])]
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
        }
        r = requests.post(
            f"{REST}/rpc/book_appointment", headers=_hdr(), json=payload, timeout=20
        )
        assert r.status_code >= 400, f"expected error, got {r.status_code} {r.text}"
        assert "INVALID_PHONE" in r.text.upper(), f"unexpected err: {r.text}"
