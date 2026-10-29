# AGENTS.md

- Monorepo aus zwei `git subtree`-Imports: `server/` (vacuula, AGPL-3.0) und `esp/` (OpenNeato, MIT). Upstream-Regeln in `server/` und `esp/AGENTS.md` gelten in ihren Ordnern.
- Änderungen pro Commit möglichst auf **einen** Ordner beschränken, damit `git subtree split` saubere Upstream-PRs erlaubt.
- Produktiver Vacuula-Server: separater Stack mit dem offiziellen Image (lokal: siehe private Notizen). Nicht neu starten, während der Roboter reinigt oder kartiert.
- Dev-Server: `docker compose -f compose.dev.yaml up --build` (andere Ports, eigenes Volume, kein mDNS). Der Roboter spricht weiter mit dem Produktiv-Server.
- Keine Befehle an den Roboter senden, die Reinigung/Kartierung unterbrechen, ohne Rückfrage.
