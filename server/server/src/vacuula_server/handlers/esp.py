"""ESP32-Bridge (OpenNeato) über den Server: Adresse einstellen und ausgewählte ESP-Endpunkte durchreichen.

Der Browser spricht den ESP nie direkt an (kein CORS, Adresse nur hier gepflegt). Durchgereicht werden nur
die Pfade aus ALLOWED, damit die App keine beliebigen ESP-Befehle schicken kann.
"""
from __future__ import annotations

import logging
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from vacuula_server.esp import poller
from vacuula_server.esp.config import get_esp_host, set_esp_host, valid_host

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler

logger = logging.getLogger(__name__)

TIMEOUT_S = 10

# (Methode, Pfad unter /api/ des ESP)
ALLOWED: set[tuple[str, str]] = {
    ("GET", "settings"), ("PUT", "settings"),
    ("GET", "user-settings"), ("POST", "user-settings"),
    ("GET", "system"), ("POST", "system/restart"),
    ("GET", "version"), ("GET", "firmware/version"),
    ("GET", "wifi/status"),
    ("GET", "charger"), ("GET", "analog"), ("GET", "warranty"),
    ("POST", "battery/new"),
    ("POST", "notifications/test"),
    ("POST", "clear-errors"),
}


def get_esp(req: RouterHandler) -> None:
    """GET /esp - Adresse und Verbindungsstatus"""
    p = poller.current
    req.send_ok({
        "host": get_esp_host() or "",
        "online": bool(p and p.online and p.host == get_esp_host()),
        "last_ok": p.last_ok if p else None,
    })


def put_esp(req: RouterHandler) -> None:
    """PUT /esp {"host": "..."} - Adresse ändern ('' schaltet ab)"""
    if (data := req.read_json()) is None: return
    host = str(data.get("host", "")).strip()
    if not valid_host(host):
        return req.send_bad_request("invalid host")
    set_esp_host(host)
    logger.info("ESP address set to %r", host)
    get_esp(req)


def proxy_esp(req: RouterHandler, path: str) -> None:
    """/esp/api/<path>[?query] - an http://<esp>/api/<path> durchreichen"""
    path = path.strip("/")
    if (req.command, path) not in ALLOWED or not re.fullmatch(r"[a-z0-9/-]+", path):
        return req.send_error_response(403, "not allowed")
    host = get_esp_host()
    if not host:
        return req.send_error_response(409, "no ESP address")
    body = req.read_data() if req.command in ("PUT", "POST") else None
    if body is None and req.command in ("PUT", "POST"):
        return
    query = urlsplit(req.path).query
    url = f"http://{host}/api/{path}" + (f"?{query}" if query else "")
    request = urllib.request.Request(url, data=body or (b"" if req.command in ("PUT", "POST") else None), method=req.command)
    if body:
        request.add_header("Content-Type", req.headers.get("Content-Type", "application/json"))
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as resp:
            content = resp.read()
            ctype = resp.headers.get("Content-Type", "application/json")
            req.send_response_data(content, status=resp.status, content_type=ctype, cache_control="no-store")
    except urllib.error.HTTPError as e:
        req.send_response_data(e.read(), status=e.code, content_type=e.headers.get("Content-Type", "application/json"))
    except Exception as e:
        logger.info("ESP %s %s failed after %.1fs: %s", req.command, path, time.time() - started, e)
        req.send_error_response(504, "ESP not reachable")
