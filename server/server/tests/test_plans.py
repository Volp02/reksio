"""Zeitplan: Prüfung der Eingaben, nächster Start, einzelnen Start auslassen."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from vacuula_server import plans

TZ = ZoneInfo("Europe/Berlin")
SAT = datetime(2026, 10, 31, 12, 0, tzinfo=TZ)  # Samstag


def plan(**kw):
    p = plans.validate([{"days": [0, 1, 2, 3, 4, 5, 6], "time": "16:55", "zones": [], **kw}])
    assert p is not None
    return p[0]


def test_validate_rejects_bad_input():
    assert plans.validate([{"days": [], "time": "10:00"}]) is None
    assert plans.validate([{"days": [1], "time": "25:00"}]) is None
    assert plans.validate([{"days": [1], "time": "10:00", "skip": "morgen"}]) is None
    assert plans.validate([{"days": [1], "time": "10:00", "zones": [{"id": "z"}]}]) is None  # Zonen brauchen mapId


def test_next_run_today_or_tomorrow():
    assert datetime.fromtimestamp(plans.next_run(plan(), SAT), TZ) == SAT.replace(hour=16, minute=55)
    after = SAT.replace(hour=17)
    assert datetime.fromtimestamp(plans.next_run(plan(), after), TZ).day == 1


def test_skip_moves_next_run():
    p = plan(skip="2026-10-31")
    assert datetime.fromtimestamp(plans.next_run(p, SAT), TZ) == datetime(2026, 11, 1, 16, 55, tzinfo=TZ)


def test_weekday_numbering_sunday_is_zero():
    p = plan(days=[0])
    assert plans._due(p, SAT) is None
    assert plans._due(p, SAT.replace(day=1, month=11)) is not None
