from __future__ import annotations
import time

from sqlalchemy import String, Integer, Boolean, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base

# currently unused
class Error(Base):
    __tablename__ = "error"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=True) # robot may not be defined when the error happened

    start_at: Mapped[int] = mapped_column(Integer, nullable=False)
    end_at: Mapped[int] = mapped_column(Integer, nullable=False)
    charge_at_start: Mapped[int] = mapped_column(Integer, nullable=False)
    charge_at_end: Mapped[int] = mapped_column(Integer, nullable=False)
    cleaned_area: Mapped[float] = mapped_column(Float, nullable=False)


    created_at: Mapped[int] = mapped_column(
        Integer,
        default=lambda: int(time.time()),
        nullable=False
    )
