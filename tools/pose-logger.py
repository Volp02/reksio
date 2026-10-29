#!/usr/bin/env python3
"""Schritt 0: Roboter-Position über den ESP (OpenNeato) mitloggen.

Fragt per OpenNeato-Endpoint `POST /api/serial` die Befehle `GetRobotPos Smooth`,
`GetRobotPos Raw` und `GetState` ab und schreibt jede Antwort als JSON-Zeile.
Das Antwortformat von GetRobotPos ist unbekannt, deshalb wird es roh gespeichert.

Mit `--vacuula` werden beim Beenden (Ctrl+C) die letzten Runs samt Karten-Metadaten
vom Vacuula-Server geholt, um die Koordinaten mit der Karte abzugleichen.
Es werden nur lesende Befehle an Roboter und Server geschickt.

    python3 -I tools/pose-logger.py --esp <ESP-IP> --vacuula http://<SERVER-IP>:8050
"""

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

COMMANDS = ["GetRobotPos Smooth", "GetRobotPos Raw", "GetState"]


def esp_serial(esp: str, cmd: str, timeout: float) -> str:
    url = f"http://{esp}/api/serial?" + urllib.parse.urlencode({"cmd": cmd})
    req = urllib.request.Request(url, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def get_json(url: str, timeout: float):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.load(resp)


def dump_vacuula(base: str, out_dir: Path, timeout: float) -> None:
    base = base.rstrip("/")
    robots = get_json(f"{base}/api/robots", timeout)
    (out_dir / "vacuula-robots.json").write_text(json.dumps(robots, indent=2))
    serials = list(robots) if isinstance(robots, dict) else [r["serial"] for r in robots]
    for serial in serials:
        runs = get_json(f"{base}/api/robot/{serial}/runs", timeout)
        (out_dir / f"vacuula-runs-{serial}.json").write_text(json.dumps(runs, indent=2))
        for run in runs[-3:]:
            run_id = run["id"]
            data = get_json(f"{base}/api/robot/{serial}/run/{urllib.parse.quote(run_id, safe=':')}", timeout)
            name = run_id.replace(":", "")
            (out_dir / f"vacuula-run-{serial}-{name}.json").write_text(json.dumps(data, indent=2))
        maps = get_json(f"{base}/api/robot/{serial}/maps", timeout)
        (out_dir / f"vacuula-maps-{serial}.json").write_text(json.dumps(maps, indent=2))
        for m in maps:
            map_id = m["id"]
            data = get_json(f"{base}/api/robot/{serial}/maps/{urllib.parse.quote(map_id, safe=':')}", timeout)
            name = map_id.replace(":", "")
            (out_dir / f"vacuula-map-{serial}-{name}.json").write_text(json.dumps(data, indent=2))
    print(f"Vacuula-Daten gespeichert in {out_dir}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--esp", required=True, help="IP/Hostname des ESP (OpenNeato)")
    p.add_argument("--interval", type=float, default=1.0, help="Sekunden zwischen Abfragen (Default 1.0)")
    p.add_argument("--timeout", type=float, default=5.0)
    p.add_argument("--vacuula", help="Vacuula-URL, z. B. http://<SERVER-IP>:8050")
    p.add_argument("--out", default="logs", help="Ausgabeordner (Default ./logs)")
    args = p.parse_args()

    out_dir = Path(args.out) / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "pose.jsonl"
    print(f"Logge nach {log_path} (Ctrl+C zum Beenden)")

    count = 0
    try:
        with log_path.open("a") as log:
            while True:
                t0 = time.time()
                entry = {"ts": t0}
                for cmd in COMMANDS:
                    try:
                        entry[cmd] = esp_serial(args.esp, cmd, args.timeout)
                    except Exception as e:  # ESP busy/offline: weiterloggen
                        entry[cmd] = None
                        entry.setdefault("errors", {})[cmd] = str(e)
                log.write(json.dumps(entry) + "\n")
                log.flush()
                count += 1
                if count == 1 or count % 30 == 0:
                    print(f"[{count}] {(entry.get('GetRobotPos Smooth') or '').strip()[:120]!r}")
                time.sleep(max(0.0, args.interval - (time.time() - t0)))
    except KeyboardInterrupt:
        print(f"\n{count} Einträge geschrieben.")

    if args.vacuula:
        dump_vacuula(args.vacuula, out_dir, args.timeout)


if __name__ == "__main__":
    main()
