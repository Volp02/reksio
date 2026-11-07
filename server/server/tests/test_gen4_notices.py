"""Gen4: Hinweise aus peer.state und robots.error_codes."""
from __future__ import annotations

from vacuula_server.gen4 import notices


def st(state, action):
    return {"state": state, "action": action}


def test_transitions():
    t = notices.transition
    assert t(None, st("busy", "cleaning")) is None
    assert t(st("idle", "invalid"), st("busy", "cleaning")) == "robot_started"
    assert t(st("busy", "cleaning"), st("paused", "cleaning")) == "robot_paused"
    assert t(st("busy", "cleaning"), st("busy", "cleaning_standby")) == "robot_charging_resume"
    assert t(st("busy", "cleaning_standby"), st("busy", "cleaning")) == "robot_resumed"
    assert t(st("busy", "cleaning"), st("busy", "docking")) == "robot_returning"
    assert t(st("busy", "docking"), st("idle", "invalid")) == "robot_finished"
    assert t(st("paused", "cleaning"), st("busy", "cleaning")) is None  # fortgesetzt: keine eigene Meldung
    assert t(st("idle", "invalid"), st("idle", "invalid")) is None


def test_events_and_errors(monkeypatch):
    sent = []
    monkeypatch.setattr(notices, "broadcast", lambda e, d: sent.append(d))
    monkeypatch.setattr(notices, "_name", lambda s: "D8")
    ev = lambda body: {"type": "event", "to": {"service": "peer.state"}, "body": body}
    notices.on_event("x", ev({"state": "idle", "action": "invalid", "errors": None}))
    notices.on_event("x", ev({"state": "busy", "action": "cleaning", "errors": None}))
    err = [{"code": "lw_hanging", "severity": "error"}, {"code": "return_to_base", "severity": "warning"}]
    notices.on_event("x", ev({"state": "error", "action": "cleaning", "errors": err}))
    notices.on_event("x", ev({"state": "error", "action": "cleaning", "errors": err}))  # schon gemeldet
    notices.on_event("x", {"type": "event", "to": {"service": "robots.error_codes"}, "body": {"code": "lw_hanging", "severity": "error"}})
    assert [(n["type"], n.get("code")) for n in sent] == [("robot_started", None), ("robot_error", "lw_hanging")]
    assert sent[0]["name"] == "D8"
    # behoben und wieder aufgetreten: erneut melden
    notices.on_event("x", ev({"state": "busy", "action": "cleaning", "errors": None}))
    notices.on_event("x", {"type": "event", "to": {"service": "robots.error_codes"}, "body": {"code": "lw_hanging", "severity": "error"}})
    assert [n["type"] for n in sent][-1] == "robot_error" and len(sent) == 3
