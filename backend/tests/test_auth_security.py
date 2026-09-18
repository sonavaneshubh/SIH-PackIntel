"""Authorization-layer tests for the Inspector ID authentication migration.

These exercise ``app.core.security.verify_auth_token`` in isolation (no live
Supabase project) so the server-side authorization rules are pinned:

* no Supabase configured  -> 503 in production, local identity in development
* missing/malformed token -> 401
* invalid/expired token   -> 401
* missing profile         -> 403
* inspector not approved  -> 403
* unknown role            -> 403
* admin / approved inspector -> allowed

This is the backend half of "Test 5 — API Security".
"""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import security
from app.core.config import settings


def _call(authorization=None):
    return asyncio.run(security.verify_auth_token(authorization=authorization))


class _FakeQuery:
    def __init__(self, rows, *, raise_exc=False):
        self._rows = rows
        self._raise = raise_exc

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self):
        if self._raise:
            raise RuntimeError("profile lookup failed")
        return SimpleNamespace(data=self._rows)


def _client(*, user=None, get_user_exc=None, profile_rows=None, profile_exc=False):
    """Build a fake Supabase client with the surface security.py uses."""

    class _Auth:
        def get_user(_self, token):
            if get_user_exc is not None:
                raise get_user_exc
            return SimpleNamespace(user=user)

    class _Client:
        def __init__(self):
            self.auth = _Auth()

        def table(self, name):
            return _FakeQuery(profile_rows or [], raise_exc=profile_exc)

    return _Client()


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")


@pytest.fixture
def dev(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")


def test_production_without_supabase_fails_closed(monkeypatch, prod):
    monkeypatch.setattr(security, "get_supabase_client", lambda: None)
    with pytest.raises(HTTPException) as exc:
        _call(None)
    assert exc.value.status_code == 503


def test_development_without_supabase_returns_local_identity(monkeypatch, dev):
    monkeypatch.setattr(security, "get_supabase_client", lambda: None)
    identity = _call(None)
    assert identity["verification_status"] == "approved"


def test_missing_token_is_unauthorized(monkeypatch):
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=SimpleNamespace(id="u1", email="a@b.c")))
    with pytest.raises(HTTPException) as exc:
        _call(None)
    assert exc.value.status_code == 401


def test_malformed_authorization_header_is_unauthorized(monkeypatch):
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=SimpleNamespace(id="u1", email="a@b.c")))
    with pytest.raises(HTTPException) as exc:
        _call("Token abc")
    assert exc.value.status_code == 401


def test_invalid_token_is_unauthorized(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_supabase_client",
        lambda: _client(get_user_exc=RuntimeError("bad token")),
    )
    with pytest.raises(HTTPException) as exc:
        _call("Bearer not-a-real-token")
    assert exc.value.status_code == 401


def test_token_without_user_is_unauthorized(monkeypatch):
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=None))
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 401


def test_missing_profile_is_forbidden(monkeypatch):
    user = SimpleNamespace(id="u1", email="a@b.c")
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=[]))
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 403


def test_profile_lookup_failure_is_unavailable(monkeypatch):
    user = SimpleNamespace(id="u1", email="a@b.c")
    monkeypatch.setattr(
        security,
        "get_supabase_client",
        lambda: _client(user=user, profile_rows=[], profile_exc=True),
    )
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 503


def test_pending_inspector_is_forbidden(monkeypatch):
    user = SimpleNamespace(id="u1", email="a@b.c")
    rows = [{"role": "inspector", "verification_status": "pending"}]
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=rows))
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 403


def test_suspended_inspector_is_forbidden(monkeypatch):
    user = SimpleNamespace(id="u1", email="a@b.c")
    rows = [{"role": "inspector", "verification_status": "suspended"}]
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=rows))
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 403


def test_unknown_role_is_forbidden(monkeypatch):
    user = SimpleNamespace(id="u1", email="a@b.c")
    rows = [{"role": "manufacturer", "verification_status": "approved"}]
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=rows))
    with pytest.raises(HTTPException) as exc:
        _call("Bearer token")
    assert exc.value.status_code == 403


def test_approved_inspector_is_allowed(monkeypatch):
    user = SimpleNamespace(id="u1", email="i@inspectors.packintel.local")
    rows = [{"role": "inspector", "verification_status": "approved"}]
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=rows))
    identity = _call("Bearer token")
    assert identity["role"] == "inspector"
    assert identity["sub"] == "u1"


def test_admin_is_allowed(monkeypatch):
    user = SimpleNamespace(id="u2", email="admin@packintel.local")
    rows = [{"role": "admin", "verification_status": "approved"}]
    monkeypatch.setattr(security, "get_supabase_client", lambda: _client(user=user, profile_rows=rows))
    identity = _call("Bearer token")
    assert identity["role"] == "admin"
