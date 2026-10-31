from __future__ import annotations

from typing import Any

from sqlalchemy import Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base


class BoundaryBackup(Base):
    """Stand der Zonen und No-Go-Linien einer Karte (Gen3), gesichert vor und nach jedem setMapBoundaries."""
    __tablename__ = "boundary_backup"
    __table_args__ = (Index("ix_boundary_backup_robot_map_ts", "robot", "map_id", "ts"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    map_id: Mapped[str] = mapped_column(String, nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    boundaries: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
