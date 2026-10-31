from __future__ import annotations

from typing import Any

from sqlalchemy import Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base


class CleaningJob(Base):
    """Ein Auftrag aus mehreren Reinigungen (Zonenfolge) oder ein Start des Zeitplans, mit allen Versuchen pro Zone."""
    __tablename__ = "cleaning_job"
    __table_args__ = (Index("ix_cleaning_job_robot_started", "robot", "started"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    started: Mapped[float] = mapped_column(Float, nullable=False)
    finished: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)        # app | plan
    plan_id: Mapped[str | None] = mapped_column(String, nullable=True)
    map_id: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)        # running | done | partial | failed | stopped | started
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    # [{id, name, status: pending|cleaning|done|failed|skipped, attempts: [{start, end, run, result, alerts}]}]
    zones: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)


class Incident(Base):
    """Fehler oder Hinweis des Roboters (ESP: GetErr, Cloud: getRobotState) von Auftreten bis Verschwinden."""
    __tablename__ = "incident"
    __table_args__ = (Index("ix_incident_robot_ts", "robot", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    end_ts: Mapped[float | None] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)        # esp | robot
    code: Mapped[str] = mapped_column(String, nullable=False)          # alert_… / error_…
    message: Mapped[str | None] = mapped_column(String, nullable=True)


class RobotReport(Base):
    """Rohdaten, die der Roboter von sich aus schickt (life_stats nach jeder Fahrt, push_notifications)."""
    __tablename__ = "robot_report"
    __table_args__ = (Index("ix_robot_report_robot_ts", "robot", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)          # life_stats | push
    ref: Mapped[str | None] = mapped_column(String, nullable=True)     # Run-ID bei life_stats
    data: Mapped[Any] = mapped_column(JSON, nullable=True)
