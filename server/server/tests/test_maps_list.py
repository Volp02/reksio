"""Gen3-Karte aus der Liste nehmen und wiederherstellen (nur eigene, vorhandene Karten)."""
from __future__ import annotations

from vacuula_server.db import get_session
from vacuula_server.handlers.app import delete_map, restore_floorplan
from vacuula_server.handlers.route_matcher import APP_ROUTES, find_route
from vacuula_server.models.persistent_map import PersistentMap

from conftest import SERIAL


class Req:
    def __init__(self):
        self.status = None

    def send_ok(self, data=None):
        self.status = 200

    def send_not_found(self, msg=""):
        self.status = 404

    def send_bad_request(self, msg=""):
        self.status = 400


def add_map(map_id="m1", robot=SERIAL):
    with get_session() as session:
        session.add(PersistentMap(id=map_id, robot=robot, name="EG", enabled=True, in_maps_list=True, base=[0, 0]))
        session.commit()


def get_map(map_id="m1"):
    with get_session() as session:
        m = session.get(PersistentMap, map_id)
        return (m.in_maps_list, m.enabled)


def call(handler, serial=SERIAL, map_id="m1"):
    req = Req()
    handler(req, serial, map_id)
    return req.status


def test_delete_then_restore():
    add_map()
    assert call(delete_map) == 200
    assert get_map() == (False, False)
    assert call(restore_floorplan) == 200
    assert get_map() == (True, False)


def test_restore_checks_owner_and_existence():
    add_map(robot="OPS00000-111111111111")
    with get_session() as session:
        session.get(PersistentMap, "m1").in_maps_list = False
        session.commit()
    assert call(restore_floorplan) == 404
    assert call(restore_floorplan, map_id="fehlt") == 404
    assert get_map() == (False, True)


def test_restore_only_gen3():
    assert call(restore_floorplan, serial="0123456789") == 400


def test_routes():
    for method, handler in (("DELETE", delete_map), ("PUT", restore_floorplan)):
        found, params = find_route(APP_ROUTES, method, f"/api/robot/{SERIAL}/maps/m1")
        assert found is handler and params == [SERIAL, "m1"]
