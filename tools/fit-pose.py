#!/usr/bin/env python3
"""Schritt 0: Transformation Roboter-Pose (Meter) -> Pixel der Vacuula-Run-Karte bestimmen.

Nimmt das pose.jsonl vom pose-logger und eine Run-Karte von Vacuula
(`vacuula-run-<serial>-<run>.json`) und sucht Maßstab, Drehung/Spiegelung und
Verschiebung, bei denen die geloggten Posen am besten auf der gefahrenen Spur liegen.

Modell:  px = ox + s * (a*x + b*y),  py = oy + s * (c*x + d*y)
mit (a b; c d) = Drehung um phi, optional gespiegelt.

    python3 -I tools/fit-pose.py logs/<ordner>/pose.jsonl logs/<ordner>/vacuula-run-...json \\
        --start 19:59:24 [--end 21:01:00] [--svg out.svg]

Keine Abhängigkeiten außer der Standardbibliothek.
"""

import argparse
import json
import math
import re
from datetime import datetime

POSE_RE = re.compile(r"X=([-\d.]+), Y=([-\d.]+), Theta=([-\d.]+)")
STATE_RE = re.compile(r"Robot State is: (\S+)")
DOCK_VALUES = {100, 200}
BACKGROUND = 128


def load_run_map(path):
    m = json.load(open(path))
    w, h = m["width"], m["height"]
    cells = []
    for value, count in m["rle"]:
        cells.extend([value] * count)
    assert len(cells) == w * h, "RLE passt nicht zur Kartengröße"
    return w, h, cells


def load_poses(path, start, end):
    poses = []
    for line in open(path):
        e = json.loads(line)
        t = datetime.fromtimestamp(e["ts"]).strftime("%H:%M:%S")
        if t < start or (end and t > end):
            continue
        state = STATE_RE.search(e.get("GetState") or "")
        p = POSE_RE.search(e.get("GetRobotPos Smooth") or "")
        if not p:
            continue
        x, y, th = map(float, p.groups())
        poses.append((e["ts"], x, y, th, state.group(1) if state else None))
    return poses


def distance_field(w, h, mask):
    """Chamfer-Distanz (3-4) zum nächsten Pixel in mask, in Pixeln."""
    inf = 10**9
    d = [0 if mask[i] else inf for i in range(w * h)]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            v = d[i]
            if x > 0: v = min(v, d[i - 1] + 3)
            if y > 0:
                v = min(v, d[i - w] + 3)
                if x > 0: v = min(v, d[i - w - 1] + 4)
                if x < w - 1: v = min(v, d[i - w + 1] + 4)
            d[i] = v
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            i = y * w + x
            v = d[i]
            if x < w - 1: v = min(v, d[i + 1] + 3)
            if y < h - 1:
                v = min(v, d[i + w] + 3)
                if x < w - 1: v = min(v, d[i + w + 1] + 4)
                if x > 0: v = min(v, d[i + w - 1] + 4)
            d[i] = v
    return [v / 3 for v in d]


def matrix(phi_deg, flip):
    c, s = math.cos(math.radians(phi_deg)), math.sin(math.radians(phi_deg))
    # Bildkoordinaten: y nach unten; flip spiegelt die Roboter-y-Achse
    f = -1 if flip else 1
    return (c, -s * f, s, c * f)


def score(pts, field, w, h, s, rot, ox, oy):
    a, b, c, d = rot
    total, outside = 0.0, 0
    for x, y in pts:
        px = ox + s * (a * x + b * y)
        py = oy + s * (c * x + d * y)
        ix, iy = int(round(px)), int(round(py))
        if 0 <= ix < w and 0 <= iy < h:
            total += min(field[iy * w + ix], 30)
        else:
            total += 30
            outside += 1
    return total / len(pts), outside


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pose")
    p.add_argument("runmap")
    p.add_argument("--start", default="00:00:00", help="Ortszeit HH:MM:SS, ab Abdocken")
    p.add_argument("--end", help="Ortszeit HH:MM:SS")
    p.add_argument("--scale", type=float, help="Maßstab in px/m festhalten (bei kurzen Logs)")
    p.add_argument("--svg", help="Kontrollbild: Spur (grau) + transformierte Posen (rot)")
    args = p.parse_args()

    w, h, cells = load_run_map(args.runmap)
    values = sorted(set(cells))
    print(f"Karte {w}x{h}, Pixelwerte {values}")
    path_mask = [v not in DOCK_VALUES and v != BACKGROUND for v in cells]
    dock = [(i % w, i // w) for i, v in enumerate(cells) if v in DOCK_VALUES]
    dx = sum(x for x, _ in dock) / len(dock) if dock else w / 2
    dy = sum(y for _, y in dock) / len(dock) if dock else h / 2
    print(f"Dock-Marker: {len(dock)} px, Mitte ({dx:.1f}, {dy:.1f}), Spur: {sum(path_mask)} px")

    poses = load_poses(args.pose, args.start, args.end)
    moving = [(x, y) for _, x, y, _, st in poses if st and st.startswith("ST_F")]
    pts = sorted(set((round(x, 2), round(y, 2)) for x, y in moving))
    sample = pts[:: max(1, len(pts) // 400)]
    print(f"{len(poses)} Posen, {len(moving)} in Fahrt, {len(pts)} verschieden, Stichprobe {len(sample)}")
    field = distance_field(w, h, path_mask)

    # 1) grob: 8 Ausrichtungen x Maßstab, Ursprung = Dock-Mitte
    best = None
    for flip in (False, True):
        for phi in range(0, 360, 90):
            rot = matrix(phi, flip)
            for s10 in ([round(args.scale * 10)] if args.scale else range(80, 600, 5)):
                s = args.scale or s10 / 10
                sc, _ = score(sample, field, w, h, s, rot, dx, dy)
                if best is None or sc < best[0]:
                    best = (sc, s, phi, flip, dx, dy)
    print("grob:  Fehler %.2f px, %.1f px/m, phi %d, flip %s" % best[:4])

    # 2) fein: lokale Suche über Maßstab, Winkel, Ursprung
    sc, s, phi, flip, ox, oy = best
    phi = float(phi)
    steps = [0.0 if args.scale else 1.0, 2.0, 2.0, 2.0]  # s, phi, ox, oy
    while max(steps) > 0.02:
        improved = False
        for k in range(1 if args.scale else 0, 4):
            for sign in (1, -1):
                cand = [s, phi, ox, oy]
                cand[k] += sign * steps[k]
                c_sc, _ = score(sample, field, w, h, cand[0], matrix(cand[1], flip), cand[2], cand[3])
                if c_sc < sc:
                    sc, (s, phi, ox, oy) = c_sc, cand
                    improved = True
        if not improved:
            steps = [st / 2 for st in steps]
    full_sc, outside = score(pts, field, w, h, s, matrix(phi, flip), ox, oy)
    print(f"fein:  Fehler {full_sc:.2f} px (alle Punkte, {outside} außerhalb)")
    print(f"       Maßstab {s:.2f} px/m = {1000 / s:.1f} mm/px, phi {phi:.2f}°, flip {flip}")
    print(f"       Ursprung ({ox:.1f}, {oy:.1f}) px, Dock-Mitte ({dx:.1f}, {dy:.1f}) px")
    print(json.dumps({"px_per_m": round(s, 3), "phi_deg": round(phi, 2), "flip": flip,
                      "origin_px": [round(ox, 1), round(oy, 1)]}))

    if args.svg:
        a, b, c, d = matrix(phi, flip)
        out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 2}" height="{h * 2}">',
               f'<rect width="{w}" height="{h}" fill="#fff"/>']
        for i, m in enumerate(path_mask):
            if m:
                out.append(f'<rect x="{i % w}" y="{i // w}" width="1" height="1" fill="#bbb"/>')
        for x, y in dock:
            out.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#2a7"/>')
        line = " ".join(f"{ox + s * (a * x + b * y):.1f},{oy + s * (c * x + d * y):.1f}" for x, y in moving)
        out.append(f'<polyline points="{line}" fill="none" stroke="#d22" stroke-width="0.6" stroke-opacity="0.8"/>')
        out.append("</svg>")
        open(args.svg, "w").write("\n".join(out))
        print(f"Kontrollbild: {args.svg}")


if __name__ == "__main__":
    main()
