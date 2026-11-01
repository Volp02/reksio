"""LIDAR auf Abruf: Scan lesen, ruhige Scans erkennen, in Posen-Koordinaten umrechnen."""
from __future__ import annotations

import time

from vacuula_server.esp import lidar

SCAN = "\r\n".join([
    "GetLDSScan", "AngleInDegrees,DistInMM,Intensity,ErrorCodeHEX",
    "0,1070,1024,0", "1,0,0,8035", "90,2000,512,0", "180,500,300,8021", "270,9000,10,0",
    "ROTATION_SPEED,5.00", "",
])


def test_parse_scan_keeps_valid_points():
    assert lidar.parse_scan(SCAN) == [(0, 1070), (90, 2000)]  # kein Abstand, Fehlercode, zu weit


def test_steady():
    assert lidar.steady((0, 0, 10), (0.05, 0, 12))
    assert lidar.steady((0, 0, 359), (0, 0, 1))  # über 0° hinweg
    assert not lidar.steady((0, 0, 10), (0, 0, 20))
    assert not lidar.steady((0, 0, 10), (0.2, 0, 10))


def test_project_rotates_with_heading_and_lidar_offset():
    pose = (1.0, 2.0, 90.0 - lidar.ANGLE_OFFSET_DEG)  # Blick nach +y
    # LIDAR 7 cm hinter der Mitte; 0° = nach vorn, 90° = nach links (-x)
    assert lidar.project([(0, 1070), (90, 2000)], pose, pose) == [[1.0, 3.0], [-1.0, 1.93]]


def test_lease_expires():
    lidar.request("R1")
    assert lidar.wanted("R1", time.time())
    assert not lidar.wanted("R1", time.time() + lidar.LEASE_S + 1)
    assert not lidar.wanted("R2", time.time())
    assert not lidar.wanted(None, time.time())
