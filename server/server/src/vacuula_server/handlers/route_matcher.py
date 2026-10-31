"""Shared routing utilities for handler pattern matching"""
from __future__ import annotations

import logging
import re
from typing import Callable, Optional, Tuple, List

# general
from .app import get_robots, get_maps, get_map, get_run, post_map, delete_map, post_robot, get_runs, connect_robot, post_robot_command, get_server_info
from .events import get_events
from .telemetry import get_telemetry, get_telemetry_latest, get_poses
from .app_download import get_apk
from .esp import get_esp, put_esp, proxy_esp
from .zones import get_zones, post_zones, delete_zones, get_boundary_backups, get_zone_history
from .plans import get_plans, put_plans
from .history import get_jobs, get_incidents
from .auth import get_auth, post_login, post_logout, put_password
from vacuula_server.handlers.setup import get_cert, get_log, get_log_full

#gen4
import vacuula_server.gen4.app as gen4
# from gen4.app import delete_demote_floorplan, get_boundaries, get_test, post_boundaries, post_update_floorplan_in_unuse, post_update_floorplan_in_use

# gen3
from vacuula_server.gen3.handlers.beehive import post_links, persistent_maps, upload_init, upload_finish, push_notifications, life_stats
from vacuula_server.gen3.handlers.nucleo import nucleo_init
from vacuula_server.gen3.handlers.s3_upload import s3_upload

Handler = Callable[..., None]

logger = logging.getLogger(__name__)


# Route definitions: (method, pattern, handler)
NUCLEO_ROUTES: List[Tuple[str, str, Handler]] = [
    ("POST", "/vendors/neato/login", nucleo_init),
    # Berichte kommen je nach Firmware mit Beehive- oder Cometa-Accept
    ("POST", "/push_notifications", push_notifications),
    ("POST", r"/runs/([^/]+)/life_stats", life_stats),
]

BEEHIVE_ROUTES: List[Tuple[str, str, Handler]] = [
    ("POST", "/links", post_links),
    ("POST", "/push_notifications", push_notifications),
    ("POST", r"/runs/([^/]+)/life_stats", life_stats),
    ("POST", r"/(.+)/upload_jobs", upload_init),
    ("GET", "/persistent_maps", persistent_maps),
    ("PUT", r"/(.+)/upload_jobs/(.+)", upload_finish),
]

APP_ROUTES: List[Tuple[str, str, Handler]] = [
    ("GET", "/api/cert", get_cert),
    ("GET", "/api/auth", get_auth),
    ("POST", "/api/auth/login", post_login),
    ("POST", "/api/auth/logout", post_logout),
    ("PUT", "/api/auth/password", put_password),
    ("GET", "/api/log", get_log),
    ("GET", "/api/log/full", get_log_full),
    ("GET", "/api/server", get_server_info),
    ("GET", "/api/app/reksio.apk", get_apk),
    ("GET", "/api/robots", get_robots),
    ("GET", "/api/esp", get_esp),
    ("PUT", "/api/esp", put_esp),
    ("GET", r"/api/esp/api/(.+)", proxy_esp),
    ("PUT", r"/api/esp/api/(.+)", proxy_esp),
    ("POST", r"/api/esp/api/(.+)", proxy_esp),
    ("GET", "/api/events", get_events),
    ("GET", r"/api/robot/(.+)/connect", connect_robot),
    ("GET", r"/api/robot/(.+)/maps", get_maps),
    ("GET", r"/api/robot/(.+)/run/(.+)", get_run),
    ("GET", r"/api/robot/(.+)/runs", get_runs),
    ("GET", r"/api/robot/(.+)/telemetry/latest", get_telemetry_latest),
    ("GET", r"/api/robot/(.+)/telemetry", get_telemetry),
    ("GET", r"/api/robot/(.+)/poses", get_poses),
    ("GET", r"/api/robot/([^/]+)/maps/([^/]+)/backups", get_boundary_backups),
    ("GET", r"/api/robot/([^/]+)/maps/([^/]+)/zone-history", get_zone_history),
    ("GET", r"/api/robot/(.+)/maps/(.+)/boundaries", gen4.get_boundaries),
    ("GET", r"/api/robot/(.+)/maps/(.+)", get_map),
    ("POST", r"/api/robot/(.+)/maps/(.+)/promote", gen4.post_promote),
    ("POST", r"/api/robot/(.+)/maps/(.+)/boundaries", gen4.post_boundaries),
    ("POST", r"/api/robot/(.+)/maps/(.+)/use", gen4.post_update_floorplan_in_use),
    ("POST", r"/api/robot/(.+)/maps/(.+)/unuse", gen4.post_update_floorplan_in_unuse),
    ("POST", r"/api/robot/(.+)/maps/(.+)", post_map),
    ("DELETE", r"/api/robot/(.+)/maps/(.+)", delete_map),
    ("GET", r"/api/robot/([^/]+)/jobs", get_jobs),
    ("GET", r"/api/robot/([^/]+)/incidents", get_incidents),
    ("GET", r"/api/robot/([^/]+)/plans", get_plans),
    ("PUT", r"/api/robot/([^/]+)/plans", put_plans),
    ("GET", r"/api/robot/(.+)/zones", get_zones),
    ("POST", r"/api/robot/(.+)/zones", post_zones),
    ("DELETE", r"/api/robot/(.+)/zones", delete_zones),
    ("POST", r"/api/robot/(.+)/command", post_robot_command),
    ("POST", r"/api/robot/(.+)", post_robot),
    ("DELETE", r"/api/robot/(.+)/maps/(.+)", gen4.delete_demote_floorplan),
]

S3_ROUTES: List[Tuple[str, str, Handler]] = [
    ("POST", "/", s3_upload),
]


def find_route(
    routes: List[Tuple[str, str, Handler]],
    method: str,
    path: str
) -> Tuple[Optional[Handler], List[str]]:
    """Find matching route and extract path parameters.
    
    Args:
        routes: List of (method, pattern, handler) tuples
        method: HTTP method (GET, POST, PUT, DELETE, etc.)
        path: Request path
    
    Returns:
        (handler, [path_params]) or (None, []) if not found
    """
    # Strip query string from path
    path = path.split('?')[0]
    
    for route_method, pattern, handler in routes:
        if route_method != method:
            continue
        
        # Check for exact match first
        if pattern == path:
            return handler, []
        
        # Check for regex pattern match
        match = re.match(f"^{pattern}$", path)
        if match:
            path_params = list(match.groups())
            return handler, path_params
    
    return None, []


def BrainslugHandler(ROUTES, req) -> None:
    handler, path_params = find_route(ROUTES, req.command, req.path)
    
    if handler:
        if path_params:
            handler(req, *path_params)
        else:
            handler(req)
    else:
        logger.error("No handler for %s %s", req.command, req.path)
        req.send_not_found()

