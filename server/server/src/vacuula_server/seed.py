from __future__ import annotations




from vacuula_server.db import get_session
from vacuula_server.models.robot import Robot
from vacuula_server.models.persistent_map import FloorPlan, PersistentMap





# with get_session() as session:
#     session.add(Robot(
#         name='test_robot',
#         serial='GPC23118-40bd32d13ac7',
#         password='C1B195E7412356F3669277D96E86F5A196A1315CA0BE8DEB591FAF3DEF60A40FCEFF95804AC65F0DEDA1ABB5387BB6EAFF601149ABFF452F8A7C3E9B62063BA198EC66252D9F2BCB0AF7D138A8D3A0C3617A1DB600955F22FC83AEA70C1F5A85F0D95C93D752C1CF15130B8E4AB78FD7276A11E90A69F220A49D392FE87F6163'
#     )
#     )


#     session.add(PersistentMap(
#         id='2026-05-23T17:21:45Z',
#         robot='GPC23118-40bd32d13ac7',
#         name='Floormap 1',
#         enabled=True,
#         baseX=55,
#         baseY=23
#     ))

#     session.add(PersistentMap(
#         id='2026-05-10T21:26:51Z',
#         robot='GPC23118-40bd32d13ac7',
#         name='room',
#         enabled=True,
#         baseX=55,
#         baseY=23
#     ))



#     session.commit()

#     robot: Robot | None = session.get(Robot, "GPC23118-40bd32d13ac7")
#     print(robot.name)

import base64, os

from vacuula_server.gen4.map_utils import parse_session
from vacuula_server.models.run import Gen4__Run

def maps_create(serial: str, data: dict):
    print("add new map!")
    body = data["body"]

    job_folder = f"data/uploads/maps/{serial}/{body['rank_uuid']}"
    floor_map_path = f"{job_folder}/rank_binary.pgm.nz"
    run_map_path = f"{job_folder}/real_binary.pgm.nz"
    # manifest_path = f"{job_folder}/manifest.json"
    floormap_meta, run_meta = parse_session(floor_map_path, run_map_path, job_folder)

    with get_session() as session:
        # if valid_as_persistent_map:
            session.add(FloorPlan(
                id=body['rank_uuid'],
                robot=serial,
                name="(unnamed)",
                promoted=False,
                base=(body["robot"]["base"]["x"], body["robot"]["base"]["y"], body["robot"]["base"]["dir"]),
                origin=(body["map"]["origin"]["x"], body["map"]["origin"]["y"]),
                resolution=floormap_meta["metadata"]["resolution"],
                alignment=floormap_meta["metadata"]["alignment"],
                imgsize=floormap_meta["img_size"],
                created_at=body["timing"]["end"],
                in_maps_list=False
            ))

            session.add(Gen4__Run(
                id=body['rank_uuid'],
                robot=serial,
                floorplan=body["rank_uuid"],
                started_by=body["started_by"],
                battery_consumed=body["battery_consumed"],
                runs=body["runs"],
                timing=body["timing"],
                cleaning_complete=body["cleaning_complete"]
            ))

            session.commit()

        # if not db_commit2(session, Run(
        #     id=run_id,
        #     robot=serial,
        #     persistent_map=persistent_map_id,
        #     start_at=start_at_ts,
        #     end_at=end_at_ts,
        #     charge_at_start=charge_at_start,
        #     charge_at_end=charge_at_end,
        #     cleaned_area=cleaned_area
        # )):
        #     # TODO: error
        #     return
    



serial = "2046LB01A11113365"
import json
with get_session() as session:
    session.add(Robot(
        name='gen4 robot',
        serial=serial,
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
        if not 'msg.json' in path[2]:
            print('Missing msg.json!')
            print(path)
            continue

        msg = path[0] + f'/msg.json'
        with open(msg, 'r') as f:
            data = json.load(f)

        maps_create(serial, data)
        print(data); 

