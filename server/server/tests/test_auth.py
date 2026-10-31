"""Zugangsschutz: ohne Passwort offen, mit Passwort nur mit gültiger Sitzung."""
from __future__ import annotations

from vacuula_server import auth


def h(token=None, cookie=None):
    d = {}
    if token:
        d["Authorization"] = f"Bearer {token}"
    if cookie:
        d["Cookie"] = f"theme=dark; {auth.COOKIE}={cookie}"
    return d


def test_open_without_password():
    assert not auth.enabled()
    assert auth.allowed("POST", "/api/robot/x/command", h())


def test_password_protects_api():
    auth.set_password("geheim123")
    assert auth.enabled()
    assert not auth.allowed("POST", "/api/robot/x/command", h())
    assert auth.allowed("GET", "/api/server", h())
    assert auth.allowed("POST", "/api/auth/login", h())
    assert auth.check_password("geheim123") and not auth.check_password("falsch")
    token = auth.new_session("test")
    assert auth.allowed("GET", "/api/robots?x=1", h(token=token))
    assert auth.allowed("GET", "/api/robots", h(cookie=token))
    assert not auth.allowed("GET", "/api/robots", h(token=token + "x"))
    auth.end_session(token)
    assert not auth.allowed("GET", "/api/robots", h(token=token))


def test_new_password_ends_sessions_and_empty_disables():
    auth.set_password("geheim123")
    token = auth.new_session("a")
    auth.set_password("anders456")
    assert not auth.valid(token)
    auth.set_password(None)
    assert auth.allowed("GET", "/api/robots", h())


def test_throttle_after_five_failures():
    auth._failures.clear()
    for _ in range(5):
        assert not auth.throttled("1.2.3.4")
        auth.failed("1.2.3.4")
    assert auth.throttled("1.2.3.4")
    assert not auth.throttled("5.6.7.8")
