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
- **Einrasten beim Zeichnen**: Eckpunkte liegen immer auf dem Kartenraster (zwischen den Punkten) und richten sich an den
  Kanten anderer Zonen aus (gepunktete Hilfslinie); Alt platziert frei.
- **App-Download im Web**: Einstellungen → Android-App; im Android-Browser einmalig ein schließbarer Hinweis. Die APK
  liegt als `reksio-<version>.apk` in `data/app` des Servers.
- **Start** reinigt die ganze Karte, damit No-Go-Linien gelten.
- **Daten bleiben auf dem Server**: Strecken dauerhaft, Telemetrie nach 30 Tagen auf einen Wert pro Minute ausgedünnt.
- **Android-App 0.2.0**: Serveradresse in der App (Suche im Netz), Benachrichtigungen vom Server statt vom ESP.
- **Zugang**: optionales Passwort (Einstellungen → Zugang); dann braucht jede /api-Anfrage eine Anmeldung (Cookie oder
  `Authorization: Bearer <token>` von `POST /api/auth/login`). Die Endpunkte des Roboters bleiben unberührt.
- **Karte flüssig verschieben**: reingezoomt besteht die Karte aus Kacheln, die nach und nach entstehen (höchstens
  6 ms pro Bild); Verschieben und Gleiten von Reksio zeichnen nicht mehr jede Zelle neu (vorher ruckelig, vor allem
  während Reksio fährt).
- **LIDAR live**: Knopf auf der Live-Karte (Übersicht und Karte, nur während Reksio fährt) zeigt den aktuellen
  LIDAR-Scan als Punkte um Reksio. Der ESP liest Scans nur, solange jemand zusieht (Anfrage gilt 15 s, die App erneuert
  sie alle 5 s bei sichtbarer Seite); nichts wird gespeichert, nach jedem Laden ist der Knopf aus.
- **Mehr Telemetrie vom ESP**: Saug- und Seitenbürstenstrom, Wand- und Bodensensoren (mm), Neigung und Drehrate,
  LIDAR-Drehzahl. Der Server liest dafür die rohen Serial-Antworten und wertet sie selbst aus; die ESP-Firmware erkennt
  `Vacuum_mA` und `ROTATION_SPEED` des D7 jetzt ebenfalls.
- **Kein CORS mehr**: fremde Webseiten können den Server nicht mehr über den Browser steuern (bei Bedarf `CORS_ORIGIN`).
