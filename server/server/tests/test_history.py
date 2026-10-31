"""ESP-Verlauf übernehmen und Störungen festhalten."""
from __future__ import annotations

from conftest import SERIAL
from vacuula_server import cleaning_log
from vacuula_server.esp import history_import


def test_parse_skips_broken_lines_and_maps_time():
    raw = "\n".join([
        '{"type":"session","time":1000}',
        '{"x":0.0,"y":0.0,"t":0.0,"ts":500.0}',
        '{"x":9.4{"x":1.0,"y":2.0,"t":90.0,"ts":502.0}',  # beim Schreiben abgebrochen
        '{"x":1.0,"y":2.0,"t":90.0,"ts":510.0}',
        '{"type":"summary","time":1005}',
    ])
    poses = history_import.parse(raw, 1000, 1005)
    assert poses == [(1000, 0.0, 0.0, 0.0), (1005, 1.0, 2.0, 90.0)]  # auf das Ende begrenzt


def test_norm_code():
    assert cleaning_log.norm_code("UI_ALERT_RECOVERING_LOCATION", "alert") == "alert_recovering_location"
    assert cleaning_log.norm_code("ui_error_picked_up", "error") == "error_picked_up"
    assert cleaning_log.norm_code("nav_floorplan_localization_fail", "alert") == "alert_nav_floorplan_localization_fail"


def test_incidents_open_and_close():
    cleaning_log._open.clear()
    cleaning_log.incidents_seen(SERIAL, "esp", {"alert_recovering_location": "Recovering"}, 100)
    cleaning_log.incidents_seen(SERIAL, "esp", {"alert_recovering_location": "Recovering"}, 110)
    cleaning_log.incidents_seen(SERIAL, "esp", {"error_picked_up": None}, 120)
    cleaning_log.incidents_seen(SERIAL, "esp", {}, 130)
    got = [(i["code"], i["ts"], i["end"]) for i in cleaning_log.incidents(SERIAL, 0, 200)]
    assert got == [("alert_recovering_location", 100, 120), ("error_picked_up", 120, 130)]
