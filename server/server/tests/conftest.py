"""Jeder Test bekommt eine eigene, leere SQLite-Datenbank (nie die echte unter data/)."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# außerhalb einer venv nimmt der Server das Arbeitsverzeichnis als Basis (data/, Log): nie das echte
os.chdir(tempfile.mkdtemp(prefix="reksio-test-"))
os.makedirs("data", exist_ok=True)

from vacuula_server import db  # noqa: E402
from vacuula_server.models import app_setting, boundary_backup, cleaning_log, persistent_map, robot, run, telemetry  # noqa: E402,F401
from vacuula_server.gen3 import data as gen3_data  # noqa: E402,F401
from vacuula_server.gen4 import data as gen4_data  # noqa: E402,F401

SERIAL = "OPS00000-000000000000"


@pytest.fixture(autouse=True)
def database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    db.Base.metadata.create_all(engine)
    db.SessionLocal.configure(bind=engine)
    # Server-Ereignisse ins Leere schicken
    from vacuula_server.handlers import events
    monkeypatch.setattr(events, "broadcast", lambda *a, **k: None)
    yield engine
    engine.dispose()
