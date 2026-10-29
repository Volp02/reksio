from __future__ import annotations

from sqlalchemy import String, Integer, Boolean, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from vacuula_server.db import Base

class Gen4Data(Base):
    __tablename__ = "gen4__data"

    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), primary_key=True)
    label_serial: Mapped[str] = mapped_column(String, nullable=False)
