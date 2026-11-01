# Changelog

## 0.2.0

Erstes Release mit fertigem Server-Image, App und ESP-Firmware.

- **Zeitplan des Servers**: ganze Karte oder mehrere Zonen in fester Reihenfolge, Wochentage und Uhrzeit, wartet bis
  zu 60 min auf einen bereiten Roboter, einzelne Termine lassen sich auslassen.
- **Zonenfolgen**: erkennt nicht gereinigte Zonen (z. B. „Position nicht gefunden“) und versucht sie einmal erneut.
- **Verlauf**: Zeitplan- und Zonenfahrten gruppiert, Ergebnis pro Zone, Störungen mit Uhrzeit, gefahrene Strecke auf
  der Karte (ein-/ausblendbar), ältere Fahrten aus dem ESP-Verlauf nachgetragen.
- **Zonen**: Sicherung bei jedem Speichern mit Wiederherstellen, „zuletzt gereinigt“ pro Zone, Speichern übernimmt den
  aktuellen Stand des Roboters (kein Überschreiben mehr nach Neustarts).
- **Fahrtbericht des Roboters im Verlauf**: Hochgehoben, Position verloren, Zeit in Störung und Pause, Ladestopps
  (bei Zonenfolgen zusammengezählt).
- **Einrasten beim Zeichnen**: Eckpunkte liegen immer auf dem Kartenraster (zwischen den Punkten) und richten sich an den
  Kanten anderer Zonen aus (gepunktete Hilfslinie); Alt platziert frei.
- **App-Download im Web**: Einstellungen → Android-App; im Android-Browser einmalig ein schließbarer Hinweis. Die APK
  kommt aus dem GitHub-Release zur Version des Servers; liegt eine `reksio-<version>.apk` in `data/app`, die vom Server
  (für Netze ohne Internet).
- **Start** reinigt die ganze Karte, damit No-Go-Linien gelten.
- **Daten bleiben auf dem Server**: Strecken dauerhaft, Telemetrie nach 30 Tagen auf einen Wert pro Minute ausgedünnt.
- **Android-App 0.2.0**: Serveradresse in der App (Suche im Netz), Benachrichtigungen vom Server statt vom ESP.
  Die Oberfläche steckt in der App, vom Server kommen nur die Daten: sie startet auch ohne Server („Offline“ mit
  „Erneut“ und „Serveradresse der App“) und zeigt bei einer neueren Serverversion „App-Update“.
- **Zugang**: optionales Passwort (Einstellungen → Zugang); dann braucht jede /api-Anfrage eine Anmeldung (Cookie oder
  `Authorization: Bearer <token>` von `POST /api/auth/login`). Die Endpunkte des Roboters bleiben unberührt.
- **Karte folgt beim Ziehen während der Fahrt**: schnelles Ziehen, während Reksio fährt, hat die Karte bis zum
  Loslassen eingefroren (die Gleit-Animation hat jede Zeichnung wieder abgemeldet). Reingezoomt besteht die Karte
  außerdem aus Kacheln, die nach und nach entstehen (höchstens 6 ms pro Bild).
- **LIDAR live (experimentell)**: Knopf auf der Live-Karte (Übersicht und Karte, nur während Reksio fährt) zeigt den aktuellen
  LIDAR-Scan als Punkte um Reksio. Der ESP liest Scans nur, solange jemand zusieht (Anfrage gilt 15 s, die App erneuert
  sie alle 5 s bei sichtbarer Seite); nichts wird gespeichert, nach jedem Laden ist der Knopf aus. Solange er an
  ist, steht „Experimentell“ auf der Karte.
- **Staubbehälter-Laufzeit in Minuten**: der Roboter meldet sie in Millisekunden, die Wartungskarte zeigte die rohe
  Zahl (z. B. „3.342.470 von 90 min“ statt 55 min).
- **Mehr Telemetrie vom ESP**: Saug- und Seitenbürstenstrom, Wand- und Bodensensoren (mm), Neigung und Drehrate,
  LIDAR-Drehzahl. Der Server liest dafür die rohen Serial-Antworten und wertet sie selbst aus; die ESP-Firmware erkennt
  `Vacuum_mA` und `ROTATION_SPEED` des D7 jetzt ebenfalls.
- **Karte schneller**: die Kartenpunkte werden direkt in Pixel gerechnet statt als Pfad mit zehntausenden Kreisen
  (der Seitenwechsel zur Karte dauerte ohne GPU mehrere Sekunden, „App reagiert nicht“). Karten, Zonen und Verlauf
  bleiben auf dem Gerät und erscheinen sofort, frische Daten kommen danach.
- **Kartenknöpfe** liegen nicht mehr über der Navigationsleiste.
- **Kein CORS mehr**: fremde Webseiten können den Server nicht mehr über den Browser steuern (bei Bedarf `CORS_ORIGIN`).
