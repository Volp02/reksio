"""Optionaler Zugangsschutz für /api (Web-App, Android-App, Home Assistant).

Ohne Passwort ist alles offen (wie bisher). Mit Passwort braucht jede /api-Anfrage eine Sitzung: Cookie
`reksio_session` (Browser, App-WebView) oder `Authorization: Bearer <token>` (Skripte, Home Assistant). Das Passwort
liegt als PBKDF2-Hash in app_setting, Sitzungen nur als SHA-256 ihres Tokens. Die Endpunkte des Roboters (nicht /api)
sind davon nicht betroffen.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
import time

from vacuula_server.db import get_session
from vacuula_server.models.app_setting import AppSetting

PASSWORD_KEY = "auth:password"
SESSIONS_KEY = "auth:sessions"
COOKIE = "reksio_session"
ITERATIONS = 200_000
MAX_SESSIONS = 50
SESSION_DAYS = 365
# ohne Anmeldung erreichbar: Anmeldung selbst, Serverkennung (Suche der App), Zertifikat (Einrichtung des Roboters)
OPEN = {("GET", "/api/auth"), ("POST", "/api/auth/login"), ("GET", "/api/server"), ("GET", "/api/cert")}

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}


def _get(key: str):
    with get_session() as session:
        row = session.get(AppSetting, key)
    try:
        return json.loads(row.value) if row else None
    except ValueError:
        return None


def _set(key: str, value) -> None:
    with get_session() as session:
        row = session.get(AppSetting, key)
        if value is None:
            if row:
                session.delete(row)
        elif row:
            row.value = json.dumps(value)
        else:
            session.add(AppSetting(key=key, value=json.dumps(value)))
        session.commit()


def enabled() -> bool:
    return _get(PASSWORD_KEY) is not None


def _hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex()


def check_password(password: str) -> bool:
    stored = _get(PASSWORD_KEY)
    if not stored:
        return False
    return hmac.compare_digest(_hash(password, bytes.fromhex(stored["salt"])), stored["hash"])


def set_password(password: str | None) -> None:
    """Passwort setzen (alle Sitzungen enden) oder mit None abschalten"""
    with _lock:
        if password:
            salt = secrets.token_bytes(16)
            _set(PASSWORD_KEY, {"salt": salt.hex(), "hash": _hash(password, salt)})
        else:
            _set(PASSWORD_KEY, None)
        _set(SESSIONS_KEY, None)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(label: str) -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _lock:
        sessions = {k: v for k, v in (_get(SESSIONS_KEY) or {}).items() if now - v["created"] < SESSION_DAYS * 86400}
        sessions[_token_hash(token)] = {"created": now, "label": label[:120]}
        if len(sessions) > MAX_SESSIONS:
            sessions = dict(sorted(sessions.items(), key=lambda kv: kv[1]["created"])[-MAX_SESSIONS:])
        _set(SESSIONS_KEY, sessions)
    return token


def end_session(token: str | None) -> None:
    if not token:
        return
    with _lock:
        sessions = _get(SESSIONS_KEY) or {}
        if sessions.pop(_token_hash(token), None) is not None:
            _set(SESSIONS_KEY, sessions)


def token_from(headers) -> str | None:
    auth = headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    for part in headers.get("Cookie", "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            return value
    return None


def valid(token: str | None) -> bool:
    if not token:
        return False
    s = (_get(SESSIONS_KEY) or {}).get(_token_hash(token))
    return bool(s) and time.time() - s["created"] < SESSION_DAYS * 86400


def allowed(method: str, path: str, headers) -> bool:
    """Darf diese /api-Anfrage durch?"""
    if (method, path.split("?")[0]) in OPEN or method == "OPTIONS":
        return True
    return not enabled() or valid(token_from(headers))


def throttled(ip: str) -> bool:
    """Nach 5 Fehlversuchen in 5 min: Pause für diese Adresse"""
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(ip, []) if now - t < 300]
        _failures[ip] = recent
        return len(recent) >= 5


def failed(ip: str) -> None:
    with _lock:
        _failures.setdefault(ip, []).append(time.time())
