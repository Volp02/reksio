# Reksio

Neato Botvac D7 ohne Neato-Cloud:

- **`server/`**: Fork von [vacuula/vacuula](https://github.com/vacuula/vacuula), dem Ersatz-Server für die Neato-Cloud (Python-Server + Web-App). Hier kommt die Telemetrie-Anzeige hinzu.
- **`esp/`**: Fork von [renjfk/OpenNeato](https://github.com/renjfk/OpenNeato), der ESP32-Firmware am Debug-Port des Roboters (UART). Läuft headless (nur `/api`, keine Weboberfläche); eingestellt wird in der Reksio-App unter Einstellungen → Erweitert → ESP.
- **`web/`**: Reksio-Web-App (ersetzt `server/app`), Design in `docs/DESIGN.md`.
- **`tools/`**: Hilfsskripte, z. B. `pose-logger.py` (Schritt 0: Koordinatenabgleich).
- **`android/`**: Android-App: Vacuula-Weboberfläche plus Wächter, der die gecachten ESP-Endpunkte (`/api/state`, `/api/error`, `/api/charger`) alle 20 s liest und Fehler, Pausen, Weiterfahrt und Ende als lokale Benachrichtigung meldet (nur im Heimnetz, ohne Cloud). Bau: `android/build.sh`, Adressen in `android/local.properties` (`reksio.vacuulaUrl`, `reksio.espHost`).

## Architektur

```
D7 ──UART──► ESP32 (headless, nur API) ──WLAN──► Vacuula-Server (Docker) ──► Web-App / Home Assistant
D7 ──WLAN (Cloud-Protokoll)─────────────────────► Vacuula-Server
```

## ESP-Firmware bauen und flashen (headless, Original-ESP32)

```bash
docker build -t reksio-pio -f esp/Dockerfile.build esp
docker run --rm -e FIRMWARE_VERSION=0.0-reksio-headless-$(git rev-parse --short HEAD) \
  -v "$PWD/esp:/src" -v reksio-pio-cache:/root/.platformio reksio-pio pio run -e esp32-headless
F=esp/.pio/build/esp32-headless/firmware.bin
curl -F "file=@$F" "http://<ESP-IP>/api/firmware/update?hash=$(md5sum $F | cut -d' ' -f1)"   # OTA, Einstellungen bleiben
```

Ohne Weboberfläche gibt es auch keine WLAN-Einrichtung im Notfall-Access-Point mehr: WLAN dann über das serielle
Menü (USB) oder `POST /api/wifi/connect?ssid=…&password=…` einrichten.

## Upstream

Beide Projekte sind per `git subtree` eingebunden (mit Historie).

```bash
git remote add vacuula-upstream https://github.com/vacuula/vacuula.git
git remote add openneato-upstream https://github.com/renjfk/OpenNeato.git

# Updates holen
git subtree pull --prefix=server vacuula-upstream main
git subtree pull --prefix=esp openneato-upstream main

# Änderungen für einen Upstream-PR herauslösen
git subtree split --prefix=server -b server-upstream
```

## Lizenzen

- `server/`: AGPL-3.0 (siehe `server/LICENSE`)
- `esp/`: MIT (siehe `esp/LICENSE`)
- Eigener Code außerhalb dieser Ordner: AGPL-3.0 (siehe `LICENSE`)
