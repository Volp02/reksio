"""Android-App zum Herunterladen: neueste reksio*.apk aus data/app (dort ablegen, z. B. reksio-0.2.0.apk)."""
from __future__ import annotations

import re
from pathlib import Path

from vacuula_server.constants import DATA_DIR

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from vacuula_server.handlers.router import RouterHandler

APP_DIR = DATA_DIR / "app"
VERSION_RE = re.compile(r"^reksio-(.+)\.apk$")


def latest_apk() -> Path | None:
    files = [p for p in APP_DIR.glob("reksio*.apk") if p.is_file()] if APP_DIR.is_dir() else []
    return max(files, key=lambda p: p.stat().st_mtime, default=None)


def apk_info() -> dict | None:
    """für GET /api/server: {version, size} oder None"""
    p = latest_apk()
    if p is None:
        return None
    m = VERSION_RE.match(p.name)
    return {"version": m.group(1) if m else None, "size": p.stat().st_size}


def get_apk(req: RouterHandler) -> None:
    """GET /api/app/reksio.apk"""
    p = latest_apk()
    if p is None:
        return req.send_not_found("No app available")
    req.send_response_data(p.read_bytes(), content_type="application/vnd.android.package-archive",
                           cache_control="no-cache", content_disposition=f'attachment; filename="{p.name}"')
