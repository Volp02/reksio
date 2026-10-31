"""Android-App aus data/app: neueste Datei, Version aus dem Namen, 404 ohne APK."""
from __future__ import annotations

import os
import time

from vacuula_server.handlers import app_download


class Req:
    def __init__(self):
        self.sent = None

    def send_not_found(self, msg):
        self.sent = ("404", msg)

    def send_response_data(self, content, **kw):
        self.sent = ("200", content, kw)


def test_no_app(tmp_path, monkeypatch):
    monkeypatch.setattr(app_download, "APP_DIR", tmp_path / "app")
    assert app_download.apk_info() is None
    r = Req()
    app_download.get_apk(r)
    assert r.sent[0] == "404"


def test_newest_apk(tmp_path, monkeypatch):
    d = tmp_path / "app"
    d.mkdir()
    old, new = d / "reksio-0.1.0.apk", d / "reksio-0.2.0.apk"
    old.write_bytes(b"old")
    new.write_bytes(b"newer")
    t = time.time()
    os.utime(old, (t - 100, t - 100))
    monkeypatch.setattr(app_download, "APP_DIR", d)
    assert app_download.apk_info() == {"version": "0.2.0", "size": 5}
    r = Req()
    app_download.get_apk(r)
    assert r.sent[1] == b"newer"
    assert r.sent[2]["content_type"] == "application/vnd.android.package-archive"
    assert 'filename="reksio-0.2.0.apk"' in r.sent[2]["content_disposition"]
