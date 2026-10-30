# Schritt 0: Koordinaten abgleichen

Ziel: Klären, wie die Live-Position vom ESP (`GetRobotPos Smooth`) auf die Vacuula-Karte passt.

## Ausgangslage (Gen3/D7, Firmware 4.5.3-189)

- Die Karte kommt als Bild vom Roboter (`FloorMap.png`/`RunMap.png`, 504×438 px bei der ersten Erkundung).
  Vacuula wandelt sie in `floormap.json`/`runmap.json` (RLE) um.
- **Keine Metadaten zu Ursprung oder Auflösung** in den Gen3-Karten. Bekannt ist nur die Dock-Position in Pixeln
  (`dock.pixel_x/pixel_y`, z. B. 191.5/166.0).
- `GetRobotPos Smooth`: `Robot Smooth pose: X=<m>, Y=<m>, Theta=<Grad>, Time=<s>`. Beim Abdocken wird die Pose
  auf (0,0,0) gesetzt, der Ursprung ist also das Dock und +x die Blickrichtung beim Abdocken.
  `Raw` ist reine Odometrie mit eigenem Nullpunkt und für die Karte unbrauchbar.

## Vorgehen

1. ESP wieder an den Debug-Port, OpenNeato läuft wie bisher.
2. Während einer normalen Reinigung loggen:
   ```bash
   python3 -I tools/pose-logger.py --esp <ESP-IP> --vacuula http://<SERVER-IP>:8050
   ```
   Ctrl+C, sobald der Roboter wieder angedockt ist. Danach holt das Skript Runs und Karten von Vacuula.
3. Auswerten:
   - Pose am Dock (Anfang/Ende) ↔ `dock.pixel_x/pixel_y` → Verschiebung
   - Ausdehnung der Fahrspur ↔ Ausdehnung der freien Fläche → Maßstab (mm/px)
   - Ausrichtung prüfen (Achsen gespiegelt/gedreht?)
4. Ergebnis hier dokumentieren und in `server/` als Transformation umsetzen.

## Risiken

- Laut OpenNeato setzt der Roboter seine Position bei manchen Aktionen auf 0,0,0 zurück (z. B. Fortsetzen per bloßem `Clean`).
- Wenn der Roboter mit einer gespeicherten Karte (persistent map) lokalisiert, kann sich der Bezug von der ersten Erkundung unterscheiden.

## Ergebnis (vorläufig, Logs vom 29.10.2026)

Auswertung mit `tools/fit-pose.py`: Die geloggten Posen werden auf die gefahrene Spur der Run-Karte
(Pixelwert 3) gelegt und Maßstab, Drehung und Ursprung so gesucht, dass der mittlere Abstand minimal wird.

```bash
python3 -I tools/fit-pose.py logs/<ordner>/pose.jsonl logs/<ordner>/vacuula-run-<serial>-<run>.json \
    --start <Abdocken HH:MM:SS> [--end HH:MM:SS] [--scale 25.5] [--svg kontrolle.svg]
```

| Run | Posen | Maßstab | Drehung | Spiegelung | Ursprung ↔ Dock-Marker | Fehler |
|---|---|---|---|---|---|---|
| `2026-10-29T18:59:24Z` (ganzer Lauf, 62 min) | 3557 | **25,5 px/m = 39,2 mm/px** | −1 … −2° | y gespiegelt | (+6 … +8, −2 … +2) px | 0,9 px |
| `2026-10-29T22:16:29Z` (nur die ersten 15 min) | 278 | 25,5 (fest) | 108° | y gespiegelt | (−8, +4,5) px | 1,4 px |

- **Maßstab** ist eindeutig (bei ±10 % steigt der Fehler von 0,9 auf 2 bis 4 px) und vermutlich für alle Karten gleich.
- **y-Achse gespiegelt**: Roboter-y zeigt nach links (mathematisch), Bild-y nach unten.
- **Die Drehung ist pro Run-Karte verschieden.** Die Karten sind nicht nach der Blickrichtung des Docks ausgerichtet.
  Die Dock-Marker (zwei 4×4-Blöcke, Werte 100/200) sind zu grob für die Richtung und fehlen teilweise
  (überzeichnet von der Spur).

Transformation (Pose in Metern → Pixel), mit `phi` aus dem Fit:

```
px = ox + s * ( cos(phi) * x + sin(phi) * y )
py = oy + s * ( sin(phi) * x - cos(phi) * y )
```

## Offen

- Gilt eine feste Drehung für die **Persistent Map** (Floor-Map, auf der Vacuula live zeichnen würde)? Dazu braucht es
  einen Lauf mit Pose-Log, bei dem der Roboter auf der gespeicherten Karte lokalisiert.
  OpenNeato zeichnet die Smooth-Pose in der Cleaning-History selbst auf (`/api/history`), der Pose-Logger ist dafür
  nicht nötig.
- Falls die Drehung nicht fest ist: Live-Ansicht muss sie während der Fahrt aus Spur und freier Fläche der Floor-Map schätzen.
