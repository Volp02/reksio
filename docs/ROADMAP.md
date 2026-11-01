# Roadmap

## Vor dem ersten Release (v0.2.0)

Das Release (Tag `v0.2.0`) kommt erst, wenn alles hier am echten Roboter und Handy getestet ist.

- [ ] **Start-Knopf**: reinigt die ganze Karte (Kategorie Karte) und beachtet No-Go-Linien wie „Kabel“
- [ ] **Zonenfolge mit Fehler**: eine Zone schlägt fehl (z. B. Weg versperrt) → zweiter Versuch → „nicht gereinigt“ im
      Verlauf und als Meldung
- [ ] **Zeitplan**: Termin „Ganze Karte“ startet wirklich (Kategorie Karte); „Heute auslassen“ am echten Termin
- [ ] **Verlauf**: neue Zeitplan-/Zonenfahrt erscheint gruppiert, Strecke und Störungen stimmen
- [ ] **App 0.2.0**: Installation über die alte App, Serversuche, Benachrichtigungen (Fehler, Zonen, Termin
      ausgelassen), Wächter nach Neustart des Handys; Oberfläche aus der App (Start ohne Server, „App-Update“ bei neuerem
      Server, Download-Link aus dem Release)
- [ ] **Zugang**: Passwort setzen, App und Web anmelden, Wächter mit Anmeldung, Passwort wieder entfernen
- [ ] **Release-Workflow**: Probelauf mit einem Vorab-Tag (z. B. `v0.2.0-rc1`): Image, APK, Firmware im Release

## Als Nächstes

- **Onboarding**: geführte Einrichtung beim ersten Start (Server, Roboter verbinden, ESP optional, Karte erkunden,
  Zonen anlegen), in Web-App und Android-App
- **Anleitung**: Schritt für Schritt von „Neato ohne Cloud“ bis zur fertigen Einrichtung: Server (Docker), Roboter mit
  Vacuula verbinden, ESP32 flashen und anschließen (optional), App installieren, Fehlersuche
- **README für GitHub**: was Reksio ist (Bilder), Funktionen, Schnellstart mit dem fertigen Image, Links zu Anleitung,
  Changelog und den Upstream-Projekten (Vacuula, OpenNeato), Lizenzen; auf Englisch, Deutsch als zweite Sprache

## Später

- **App offline mit letztem Stand**: letzte Antworten (Karte, Verlauf, Telemetrie) in der App zwischenspeichern und
  ohne Server als veraltet anzeigen (DESIGN.md §12.3) statt nur „Offline“

- **Home Assistant**: Reksio als Saugroboter-Entität (Zustand, Akku, Start/Stopp/Basis, Zonen als Tasten)
- **Wartung**: Filter, Bürsten und Akku mit Zählern und „getauscht“-Knopf, Erinnerungen
- **Sicherung**: Datenbank exportieren/importieren in der App
- **Upstream**: Änderungen an Vacuula und OpenNeato als Pull Requests (per `git subtree split`)
- **Emulator-Tests der App**: braucht ffmpeg mit libx264 auf dem Docker-Host
