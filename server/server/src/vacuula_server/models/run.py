from __future__ import annotations

from typing import Any

from sqlalchemy import String, Integer, Boolean, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base


class Gen3__Run(Base):
    __tablename__ = "gen3__run"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    persistent_map: Mapped[str] = mapped_column(String, ForeignKey("persistent_map.id", ondelete='CASCADE'), nullable=True)

    # TODO: for now, save the run as is, let the FE deal with it. at a later time implement a better system to handle this
    run: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )



class Gen4__Run(Base):
    __tablename__ = "gen4__run"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    robot: Mapped[str] = mapped_column(String, ForeignKey("robot.serial", ondelete='CASCADE'), nullable=False)
    floorplan: Mapped[str] = mapped_column(String, ForeignKey("gen4__floor_plan.id", ondelete='CASCADE'), nullable=True)

    started_by: Mapped[str] = mapped_column(String, nullable=False)
    battery_consumed: Mapped[int] = mapped_column(Integer, nullable=False)

    cleaning_complete: Mapped[bool] = mapped_column(Boolean, nullable=False)
    timing: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )

    runs: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
