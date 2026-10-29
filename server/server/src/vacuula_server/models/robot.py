from __future__ import annotations

from typing import Literal
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from vacuula_server.db import Base

RobotType = Literal["neato.gen3", "neato.gen4"]

class Robot(Base):
    __tablename__ = "robot"

    serial: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[RobotType] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
