from __future__ import annotations

from vacuula_server.db import get_session
from vacuula_server.gen3.data import Gen3Data
from vacuula_server.models.robot import Robot
from sqlalchemy import select

from enum import Enum

def get_robot_by_serial(serial: str) -> Robot | None:
    with get_session() as session:
        return session.execute(
            select(Robot).where(Robot.serial == serial)
        ).scalar_one_or_none()

# TODO: gen3 only, move to better location later
def get_gen3_robot_data(serial: str) -> Gen3Data | None:
    with get_session() as session:
        return session.execute(
            select(Gen3Data).where(Gen3Data.robot == serial)
        ).scalar_one_or_none()



class Generation(Enum):
    GEN2 = "gen2 (BotVac Connected)"
    GEN3 = "gen3 (D3, D4, D5, D6, D7)"
    GEN4 = "gen4 (D800, D8, D9, D10)"
