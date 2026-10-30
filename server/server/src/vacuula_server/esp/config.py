"""ESP address: set from the web app (stored in app_setting), ESP_HOST from the environment is only the default."""
from __future__ import annotations

import re
import threading

from vacuula_server.db import get_session
from vacuula_server.env import ESP_HOST
from vacuula_server.models.app_setting import AppSetting

KEY = "esp_host"
HOST_RE = re.compile(r"^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$")

_lock = threading.Lock()
_cached: str | None = None
_loaded = False


def get_esp_host() -> str | None:
    global _cached, _loaded
    with _lock:
        if not _loaded:
            with get_session() as session:
                row = session.get(AppSetting, KEY)
            _cached = row.value if row else ESP_HOST
            _loaded = True
        return _cached or None


def set_esp_host(host: str) -> None:
    """Empty string disables the ESP."""
    global _cached, _loaded
    with get_session() as session:
        row = session.get(AppSetting, KEY)
        if row:
            row.value = host
        else:
            session.add(AppSetting(key=KEY, value=host))
        session.commit()
    with _lock:
        _cached = host
        _loaded = True


def valid_host(host: str) -> bool:
    return host == "" or bool(HOST_RE.match(host))
