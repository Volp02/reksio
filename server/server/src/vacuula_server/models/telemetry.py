from __future__ import annotations

from typing import Any

from sqlalchemy import String, Integer, Float, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base


class Telemetry(Base):
    """One ESP sample: raw JSON of /api/state, /api/error, /api/charger, /api/analog, /api/motors."""
    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_robot_ts", "robot", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class Pose(Base):
    """GetRobotPos Smooth while cleaning: metres/degrees, origin = dock at undocking."""
    __tablename__ = "pose"
    __table_args__ = (Index("ix_pose_robot_ts", "robot", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    theta: Mapped[float] = mapped_column(Float, nullable=False)
