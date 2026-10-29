from __future__ import annotations
from vacuula_server.db import get_session
from vacuula_server.models.robot import Robot
from vacuula_server.models.persistent_map import FloorPlan, PersistentMap


import base64, os

from vacuula_server.gen3.map_utils import parse_session
from vacuula_server.models.run import Gen3__Run, Gen4__Run

def maps_create(serial: str, data: dict):
    print("add new map!")
    run = data['run']
    id = run['start_at']

    job_folder = f"data/uploads/maps/{serial}/{id}"
    floor_map_path = f"{job_folder}/FloorMap.png"
    run_map_path = f"{job_folder}/RunMap.png"
    manifest_path = f"{job_folder}/manifest.json"
    floormap_meta, run_meta = parse_session(floor_map_path, run_map_path, job_folder)

    print(floormap_meta)
    print("---")
    print(run_meta)


    with get_session() as session:
            session.add(PersistentMap(
                id=id,
                robot=serial,
                name="(unnamed)",
                base=(floormap_meta["dock"]["normalised_x"], floormap_meta["dock"]["normalised_y"]),
                enabled=True,
                in_maps_list=run['valid_as_persistent_map']
            ))

            session.add(Gen3__Run(
                id=id,
                robot=serial,
                persistent_map=id,
                run=run
            ))

            session.commit()




serial = "GPC23118-40bd32d13ac7"
import json

with get_session() as session:
    session.add(Robot(
        name='gen4 robot',
        serial="2046LB01A11113365",
    )
    )
    session.add(Robot(
        name='fake-robot',
        serial="fake-serial",
    )
    )

    session.add(Robot(
        name='gen3-robot',
        serial='GPC23118-40bd32d13ac7',
        password='B2A03013507E73EFBC368A69BA58B0808017F603C70E5E925311CCD839730FBC01C5A87A93AB46CC71EC81FE79F72AC08BC2D1491297C84C5C89B775F6D9DC16B93B7713B378E1DBFA4FB8A1F3B214021539BBF671F22B06A7481B1DB72A94384A7C036E8B3BFAF3A68DE9E2B52273D2ACFF281A99865EC1DB406ABBF7C5771B'
    )
    )
    session.commit()

    robot: Robot | None = session.get(Robot, serial)
    print(robot.name)

for path in os.walk(f'data/uploads/maps/{serial}'):
    if not 'manifest.json' in path[2]:
        print('Missing manifest.json!')
        print(path)
        continue

    # if not '2026-09-19T20:38:44Z' in path[0]:
    #     continue

    msg = path[0] + f'/manifest.json'
    with open(msg, 'r') as f:
        data = json.load(f)

    maps_create(serial, data)
    print(data); 

