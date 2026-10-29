# Schritt 0: Koordinaten abgleichen

Ziel: Klären, wie die Live-Position vom ESP (`GetRobotPos Smooth`) auf die Vacuula-Karte passt.

## Ausgangslage (Gen3/D7, Firmware 4.5.3-189)

- Die Karte kommt als Bild vom Roboter (`FloorMap.png`/`RunMap.png`, 504×438 px bei der ersten Erkundung).
  Vacuula wandelt sie in `floormap.json`/`runmap.json` (RLE) um.
- **Keine Metadaten zu Ursprung oder Auflösung** in den Gen3-Karten. Bekannt ist nur die Dock-Position in Pixeln
  (`dock.pixel_x/pixel_y`, z. B. 191.5/166.0).
- Format der `GetRobotPos`-Antwort ist unbekannt (auch OpenNeato speichert sie nur roh).

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
