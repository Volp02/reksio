"""Zonenfolge: fehlgeschlagene Zonen erkennen (kein Run), einmal wiederholen, Auftrag festhalten."""
from __future__ import annotations

import time

import pytest

from conftest import SERIAL
from vacuula_server import cleaning_log, zone_queue as zq
from vacuula_server.db import get_session
from vacuula_server.models.run import Gen3__Run

ZONES = [{"id": "z1", "name": "Flur"}, {"id": "z2", "name": "Treppe"}, {"id": "z3", "name": "Lajos"}]


class FakeRobot:
    """startCleaning → zwei Abfragen beschäftigt, dann Leerlauf; einen Run gibt es nur, wenn ok(zone, versuch)"""

    def __init__(self, ok):
        self.ok = ok
        self.busy = 0
        self.zone = None
        self.starts: list[str] = []
        self.t0 = 0.0

    def __call__(self, serial, cmd, timeout=10):
        if cmd["cmd"] == "startCleaning":
            self.zone = cmd["params"]["boundaryId"]
            self.starts.append(self.zone)
            self.busy, self.t0 = 2, time.time()
            return {"result": "ok"}
        state = 1
        if self.busy:
            self.busy -= 1
            state = 2
            if self.busy == 0 and self.ok(self.zone, self.starts.count(self.zone)):
                rid = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.t0))
                with get_session() as s:
                    s.merge(Gen3__Run(id=rid, robot=SERIAL, persistent_map=None, run={"status": "complete", "error": None}))
                    s.commit()
        return {"result": "ok", "state": state, "error": None, "alert": None,
                "details": {"charge": 90}, "availableCommands": {"start": state == 1}}


@pytest.fixture
def run_queue(monkeypatch):
    monkeypatch.setattr(zq, "SETTLE_S", 0)
    monkeypatch.setattr(zq, "RUN_WAIT_S", 0)
    monkeypatch.setattr(zq, "_save", lambda *a: None)
    zq._queues.clear()

    def run(robot, stop_after_starts=None):
        monkeypatch.setattr(zq, "cloud_command", robot)
        q, _ = zq.start(SERIAL, "m1", ZONES, 1, 1, "plan", "p1")
        assert q is not None
        for _ in range(100):
            cur = zq.get(SERIAL)
            if not cur:
                break
            if stop_after_starts and len(robot.starts) >= stop_after_starts and cur["status"] == "cleaning":
                zq.cancel(SERIAL, "stopCleaning")
                break
            zq._step(SERIAL, cur, time.time())
            # Runs haben Sekunden-IDs: zwei Versuche dürfen nicht in derselben Sekunde starten
            time.sleep(0.35)
        return cleaning_log.jobs(SERIAL)[0]
    return run


def statuses(job):
    return [(z["name"], z["status"], [a["result"] for a in z["attempts"]]) for z in job["zones"]]


def test_all_zones_done(run_queue):
    robot = FakeRobot(lambda zone, n: True)
    job = run_queue(robot)
    assert robot.starts == ["z1", "z2", "z3"]
    assert job["status"] == "done" and job["finished"]
    assert statuses(job) == [("Flur", "done", ["done"]), ("Treppe", "done", ["done"]), ("Lajos", "done", ["done"])]


def test_failed_zone_is_retried_once_then_skipped(run_queue):
    robot = FakeRobot(lambda zone, n: zone != "z1")
    job = run_queue(robot)
    assert robot.starts == ["z1", "z1", "z2", "z3"]
    assert job["status"] == "partial"
    assert statuses(job)[0] == ("Flur", "failed", ["failed", "failed"])
    assert job["zones"][0]["attempts"][0]["reason"] == "noRun"


def test_retry_succeeds(run_queue):
    robot = FakeRobot(lambda zone, n: zone != "z1" or n == 2)
    job = run_queue(robot)
    assert job["status"] == "done"
    assert statuses(job)[0] == ("Flur", "done", ["failed", "done"])


def test_stop_marks_rest_skipped(run_queue):
    robot = FakeRobot(lambda zone, n: True)
    job = run_queue(robot, stop_after_starts=2)
    assert job["status"] == "stopped" and job["reason"] == "stopCleaning"
    assert [z["status"] for z in job["zones"]] == ["done", "stopped", "skipped"]
