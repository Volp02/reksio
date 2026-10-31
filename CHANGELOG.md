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
- **Start** reinigt die ganze Karte, damit No-Go-Linien gelten.
- **Daten bleiben auf dem Server**: Strecken dauerhaft, Telemetrie nach 30 Tagen auf einen Wert pro Minute ausgedünnt.
- **Android-App 0.2.0**: Serveradresse in der App (Suche im Netz), Benachrichtigungen vom Server statt vom ESP.
- **Zugang**: optionales Passwort (Einstellungen → Zugang); dann braucht jede /api-Anfrage eine Anmeldung (Cookie oder
  `Authorization: Bearer <token>` von `POST /api/auth/login`). Die Endpunkte des Roboters bleiben unberührt.
- **Kein CORS mehr**: fremde Webseiten können den Server nicht mehr über den Browser steuern (bei Bedarf `CORS_ORIGIN`).
