"""Anmeldung und Passwort (siehe vacuula_server.auth)."""
from __future__ import annotations

from vacuula_server import auth

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler

MIN_LENGTH = 8


def _cookie(token: str, max_age: int) -> str:
    return f"{auth.COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"


def get_auth(req: RouterHandler) -> None:
    """GET /api/auth - {enabled, authed}"""
    on = auth.enabled()
    req.send_ok({"enabled": on, "authed": not on or auth.valid(auth.token_from(req.headers))})


def post_login(req: RouterHandler) -> None:
    """POST /api/auth/login {password, label?} - Sitzung als Cookie und Token"""
    if (data := req.read_json()) is None: return
    ip = req.client_address[0]
    if auth.throttled(ip):
        return req.send_error_response(429, "too many attempts, wait a few minutes")
    if not auth.enabled() or not auth.check_password(str(data.get("password", ""))):
        auth.failed(ip)
        return req.send_error_response(401, "wrong password")
    token = auth.new_session(str(data.get("label") or req.headers.get("User-Agent", ""))[:120])
    req.send_response_data({"token": token}, True, 200, extra_headers={"Set-Cookie": _cookie(token, auth.SESSION_DAYS * 86400)})


def post_logout(req: RouterHandler) -> None:
    """POST /api/auth/logout - diese Sitzung beenden"""
    auth.end_session(auth.token_from(req.headers))
    req.send_response_data({}, True, 200, extra_headers={"Set-Cookie": _cookie("", 0)})


def put_password(req: RouterHandler) -> None:
    """PUT /api/auth/password {password} - setzen/ändern (alle anderen Sitzungen enden), "" schaltet den Schutz ab"""
    if (data := req.read_json()) is None: return
    password = str(data.get("password") or "")
    if password and len(password) < MIN_LENGTH:
        return req.send_bad_request(f"password needs at least {MIN_LENGTH} characters")
    auth.set_password(password or None)
    if not password:
        return req.send_response_data({"enabled": False}, True, 200, extra_headers={"Set-Cookie": _cookie("", 0)})
    token = auth.new_session(req.headers.get("User-Agent", "")[:120])
    req.send_response_data({"enabled": True, "token": token}, True, 200,
                           extra_headers={"Set-Cookie": _cookie(token, auth.SESSION_DAYS * 86400)})
