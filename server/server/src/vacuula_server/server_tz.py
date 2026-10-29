from __future__ import annotations
"""
Resolution order:
  1. VACUULA_TZ environment variable - explicit override for hosts whose clock
     is not in the robot's timezone (e.g. a server in a data centre).
  2. The host system timezone via tzlocal (Windows registry -> IANA mapping,
     /etc/localtime on Linux, TZ inside containers).
  3. "Etc/UTC", logged as an ERROR - never silently.
"""

import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import tzlocal

FALLBACK_TZ = "Etc/UTC"

_cached: str | None = None

logger = logging.getLogger(__name__)

def _resolve() -> str:
    tz = os.environ.get("VACUULA_TZ")
    source = "VACUULA_TZ"
    if not tz:
        try:
            tz = tzlocal.get_localzone_name()
            source = "system"
        except Exception as e:  # tzlocal could not read the OS setting
            logger.error("could not determine the system timezone (%s: %s); using %s. Set the OS timezone or VACUULA_TZ.", type(e).__name__, e, FALLBACK_TZ)
            return FALLBACK_TZ
    try:
        ZoneInfo(tz)  # the robot needs a real IANA name
    except (ZoneInfoNotFoundError, ValueError):
        logger.error("timezone %r (from %s) is not a valid IANA zone; using %s. Fix the OS timezone or VACUULA_TZ.", tz, source, FALLBACK_TZ)
        return FALLBACK_TZ
    logger.info("server timezone: %s (from %s)", tz, source)
    return tz


def server_timezone() -> str:
    """IANA name of the timezone the server runs in."""
    global _cached
    if _cached is None:
        _cached = _resolve()
    return _cached


def utc_offset_minutes(tz: str | None = None, at: datetime | None = None) -> int:
    """Offset of `tz` (default: server timezone) from UTC, in minutes, at `at`
    (default: now). DST-aware: the value changes across a DST switch."""
    zone = ZoneInfo(tz or server_timezone())
    when = at or datetime.now(timezone.utc)
    off = when.astimezone(zone).utcoffset()
    return int(off.total_seconds() // 60) if off else 0
