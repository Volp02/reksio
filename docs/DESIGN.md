# Designsprache der Reksio-Web-App

Stand: 2026-10-30 (Europe/Berlin) · gilt für `web/` (neue Web-App, ersetzt `server/app`)
Angelehnt an die Designsprache der IBEB-Suite (Richtung „Ruhig“, Dichte „behaglich“). Übernommen sind Werte und Regeln,
kein Code: Tokens und Komponenten sind in `web/` eigenständig umgesetzt.

**Quelle der Wahrheit für Werte:** `web/src/styles/tokens.css`. Dieses Dokument beschreibt sie; bei Abweichung gilt die Datei,
das Dokument wird nachgezogen.

## 1. Grundsätze

| # | Regel |
|---|---|
| 1 | **Ruhig und live.** Die Oberfläche zeigt den aktuellen Zustand von Reksio ohne Neuladen (Event-Stream). Werte ändern sich still, ohne Animation oder Hervorhebung, und Layout springt dabei nicht (feste Breiten für Zahlen). |
| 2 | **Nichts passiert ohne Klick.** Befehle an den Roboter laufen nur über eine Schaltfläche. Befehle, die eine laufende Reinigung beenden, brauchen eine Bestätigung. Sobald ein Befehl gesendet ist, zeigt der Knopf „Sendet“, bis Reksio antwortet oder der Befehl fehlschlägt. |
| 3 | **Keine erklärenden Texte.** Nur Beschriftungen, Aktionen und Zustände. Leer-, Fehler- und Offline-Zustände zeigen Zustand + Aktion („Keine Reinigungen“, „Offline · Erneut“), keinen Erklärsatz. |
| 4 | **Hell und Dunkel, Handy und Desktop, immer alle vier.** Thema folgt dem System, manuell umschaltbar. Keine Seite ist nur für eine Bildschirmgröße gebaut. |
| 5 | **Farbe ist Orientierung.** Der Akzent markiert Aktives und Reksio selbst (Position, Spur). Zustandsfarben (ok/warn/danger/info) gehören nur Zuständen. Farbe trägt nie allein Information, immer mit Symbol oder Wort. |
| 6 | **Alles über Tokens.** Komponenten verwenden nur CSS-Variablen aus §2–§8, keine festen Farben, Abstände, Radien, Schatten. |
| 7 | **Text läuft nie aus seinem Element** (§9). |
| 8 | **Ehrliche Daten.** Fehlt ein Wert, steht „–“, nie „N/A“, „0“ oder ein leerer Zeitstempel. Veraltete Werte sind als veraltet gekennzeichnet (§12.3). |
| 9 | Zeiten in **Europe/Berlin** (Zeitzone vom Server, `GET /api/server`), Zahlen mit Tabellenziffern, Einheiten fest (§12.5). |

## 2. Tokens

CSS-Variablen in `web/src/styles/tokens.css`. Attribute am `<html>`:

| Attribut | Werte | Standard |
|---|---|---|
| `data-theme` | `light`, `dark` | nach System (`prefers-color-scheme`), Einstellung „System · Hell · Dunkel“ |
| `data-density` | `comfy`, `compact` | `comfy`, Einstellung „Darstellung“ |
| `data-contrast` | `more` | nach System (`prefers-contrast: more`) |

**Verbote:** feste Farbwerte im Komponenten-CSS, Abstände außerhalb des Rasters, eigene Schatten. Abgeleitete Töne mit
`color-mix(in oklab, …)`, nicht `oklch` (Weiß kippt dort ins Rötliche).

## 3. Farbe

### 3.1 Neutral

| Token | Rolle | Hell | Dunkel |
|---|---|---|---|
| `--page` | hinter dem App-Rahmen | `#eaebee` | `#06070b` |
| `--bg` | Grundfläche | `#f9fafc` | `#0f1217` |
| `--surface` | Karten, Felder, Menüs | `#ffffff` | `#161920` |
| `--surface-2` | Hover, Tabellenkopf, Feld im Feld | `#f3f4f7` | `#1e2229` |
| `--surface-3` | gedrückt, Zähler | `#e9ebef` | `#262a32` |
| `--border` | Trennlinien | `#e4e6ea` | `#2a2e36` |
| `--border-strong` | Felder, Buttons | `#ced1d6` | `#41454e` |
| `--text` | Haupttext | `#161b24` | `#edeef2` |
| `--text-2` | Sekundärtext, Beschriftungen | `#505561` | `#b1b4bb` |
| `--text-3` | Meta, Platzhalter | `#676c75` | `#8f929a` |

Zustände: `--hover` = `surface-2` · `--selected` = `accent-soft` · Fokus = Ring 2 px in `accent`, Abstand 2 px · `--scrim` für Overlays.

### 3.2 Akzent „Reksio“ (Petrol)

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| `--accent` | `#127a7d` | `#5fc0bd` | primäre Buttons, aktive Navigation, Fokus, Reksio auf der Karte, Spur |
| `--accent-soft` | `#e1f3f2` | `#183334` | ausgewählte Zeile, aktiver Nav-Eintrag |
| `--accent-text` | `#0b6164` | `#93dbd8` | Text auf `accent-soft`, Links |
| `--on-accent` | `#ffffff` | `#0f1217` | Text auf `accent` |

Petrol ist gewählt, weil es sich von allen Zustandsfarben (Grün, Ocker, Rot, Blau) klar abhebt; „Reinigt“ (info) und Reksio (Akzent) werden so nicht verwechselt.

### 3.3 Zustände

| Token | Rolle | Farbe | `*-soft` hell / dunkel | `*-text` hell / dunkel |
|---|---|---|---|---|
| `ok` | bereit, geladen, erfolgreich | `#389560` | `#e4f0e8` / `#1c2929` | `#306d4e` / `#74b08a` |
| `warn` | Hinweis (Behälter voll, Akku niedrig) | `#d49838` | `#f8edde` / `#342e29` | `#775c38` / `#e0bf93` |
| `danger` | Fehler, No-Go-Linie | `#cb4644` | `#fce8e6` / `#2c2126` | `#9b3e3e` / `#d9746e` |
| `info` | läuft (reinigt, fährt zur Basis, lädt) | `#4188b6` | `#e6eff6` / `#1d2631` | `#356486` / `#77a6c9` |

Immer als Status-Pill (Punkt + Wort) oder mit Symbol. Nie als Reihenfarbe in Diagrammen.

### 3.4 Diagramm-Palette

Kategorisch, feste Reihenfolge, für Diagramme und Zonenfarben:

| Slot | Hell | Dunkel |
|---|---|---|
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |
| 6 | `#008300` | `#008300` |

Slots 2–5 liegen hell unter 3:1 zur Fläche: Diagramme haben immer Direktbeschriftung oder Tooltip mit Wert und Einheit,
Legende ab zwei Reihen.

### 3.5 Karte

| Token | Ebene | Hell | Dunkel |
|---|---|---|---|
| `--map-bg` | unbekannt / Hintergrund | `#eceef2` | `#111419` |
| `--map-floor` | befahrbar (Punkt, 45 % der Zelle) | `#cfd3da` | `#2e333c` |
| `--map-wall` | Wand, Hindernis (Punkt, 75 % der Zelle) | `#505561` | `#a9adb5` |
| `--map-path` | gefahrene Spur (Punkt, 50 %, Deckkraft 80 %) | `accent` | `accent` |
| Reksio | Punkt + Blickrichtung | `accent`, Rand `on-accent` | wie hell |
| Basis | Punkt mit Rand | `ok` | `ok` |
| Zonen | Farbe der Zone vom Roboter, Fläche 18 %, Rand 2 px, Name in der Zone | — | — |
| No-Go-Linie | Farbe vom Roboter (sonst `danger`), 3 px, gestrichelt | — | — |

Jede Kartenzelle ist ein Punkt (wie in der bisherigen Vacuula-Karte). Unter der Karte steht die Legende der Zonen (Name + Farbe).
Die Karte nutzt die Thema-Farben, kein festes Bild-Schwarz-Weiß.

### 3.6 Kontrast (WCAG 2.x, berechnet)

| Paar | Hell | Dunkel | Ziel |
|---|---|---|---|
| `text` / `surface` | 17,3 | 15,2 | ≥ 4,5 |
| `text-2` / `surface` | 7,5 | 8,5 | ≥ 4,5 |
| `text-3` / `surface` · / `bg` | 5,3 · 5,1 | 5,6 · 6,0 | ≥ 4,5 |
| `text-2` / `surface-2` | 6,8 | 7,7 | ≥ 4,5 |
| `on-accent` / `accent` | 5,1 | 8,7 | ≥ 4,5 |
| `accent-text` / `accent-soft` | 6,3 | 8,6 | ≥ 4,5 |
| Zustands-Text / `*-soft` | 5,2–5,7 | 4,9–7,7 | ≥ 4,5 |
| Fokus-Ring (`accent`) / `surface` | 5,1 | 8,2 | ≥ 3 |
| Wand / befahrbar (Karte) | 7,5 | 7,7 | ≥ 3 |
| Spur (`accent`) / befahrbar | 5,1 | 7,4 | ≥ 3 |
| `border-strong` / `surface` (Felder) | 1,5 | 1,8 | ≥ 3 → **bewusste Abweichung**, Ausgleich durch Fokus-Ring und abgesetzte Feldfläche |

## 4. Typografie

| | Wert |
|---|---|
| Schrift | **Outfit** (UI), **JetBrains Mono** (Seriennummer, Firmware, Rohwerte, Logs); beide selbst gehostet (`@fontsource-variable`), kein Request an Dritte. Fallback `ui-sans-serif, system-ui` bzw. `ui-monospace` |
| Skala | Display 34 · H1 26 · H2 19 · H3 16 · Body 15 · Small 13 · Caption 12 · Overline 11 (kompakt: Body 14, Small 12,5) |
| Gewichte | 400 · 500 · 600, kein 700 |
| Zeilenhöhe | 1,5 |
| Ziffern | `tabular-nums` überall, wo Zahlen stehen oder sich live ändern; in Tabellen rechtsbündig |
| Kennzahl | großer Wert (Akku %, Fläche) in Display 34 / 500, Einheit in H3 / `text-2` daneben |

## 5. Abstand, Raster, Form

| Bereich | Werte |
|---|---|
| Abstand (4er-Raster) | `--s-1…8` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 px, multipliziert mit `--d` (Dichte) |
| Radien | `--r-s` 8 · `--r-m` 12 · `--r-l` 18 · `--r-xl` 26 · `--r-full` 999 (Pills, Chips, Statuspunkt) |
| Rahmen | 1 px; `border-strong` für Felder und Buttons |
| Schatten | `--shadow-1` Karten · `--shadow-2` Menü, Popover · `--shadow-3` Dialog; dunkel kräftiger |
| Ebenen | sticky 10 · Kartensteuerung 20 · Dropdown 40 · Sheet 60 · Dialog 70 · Toast 80 · Tooltip 90 |
| Touch | Trefferfläche ≥ 44 px (`--touch`), sichtbare Fläche darf kleiner sein |
| Breakpoints | Container-Queries auf dem App-Rahmen: Laptop ≤ 1180 · Tablet ≤ 900 · Handy ≤ 640; Testbreiten 1280 / 820 / 390 / 320 |

**Scrollen:** Die Seite scrollt, nicht Teile in der Seite. Ausnahmen: die Karte (eigenes Zoomen/Verschieben, kein Scroll),
Dialog-Inhalt, Menüs, Log-Ausgaben. Tab- und Chip-Leisten brechen um, am Handy wischbar ohne sichtbare Leiste.
Scrollleisten: 12 px Trefferfläche, Daumen 6 px sichtbar, `text-3` 40 % (Hover 75 %), Spur unsichtbar.

## 6. Icons

`lucide-react`, Umriss, Strichstärke 1,75, Größen 16 / 20 / 24 (Navigation 20, Buttons 16). Icon-Buttons haben
`aria-label` und Tooltip. Feste Zuordnung:

| Bedeutung | Icon |
|---|---|
| Übersicht · Karte · Reinigungen · Zeitplan · Einstellungen | `LayoutDashboard` · `Map` · `History` · `CalendarClock` · `Settings` |
| Start · Pause · Stopp · Zur Basis · Suchen (Ton) | `Play` · `Pause` · `Square` · `House` · `Volume2` |
| Akku (nach Stand) · lädt | `BatteryFull`/`BatteryMedium`/`BatteryLow`/`BatteryWarning` · `BatteryCharging` |
| Zone · No-Go-Linie · Reksio · Basis | `Shapes` · `Slash` · `Bot` · `PlugZap` |
| ESP-Verbindung · Offline | `Cpu` · `WifiOff` |

## 7. Bewegung

120 ms (Hover), 200 ms (Menü, Dialog, Ein-/Ausblenden), 320 ms (Sheet); Easing `cubic-bezier(.2,.7,.2,1)`.
Übergänge nur bei `prefers-reduced-motion: no-preference`. Live-Werte ändern sich ohne Animation. Die Position von Reksio
auf der Karte springt von Messung zu Messung (alle 2 s), ohne Interpolation, damit nichts angezeigt wird, was nicht gemessen ist.

## 8. Dichte

| | behaglich (Standard) | kompakt |
|---|---|---|
| `--d` | 1 | 0,82 |
| Body / Small | 15 / 13 px | 14 / 12,5 px |
| Button M · S | 40 · 32 px | ≈ 33 · 27 px |
| Eingabefeld | 40 px | ≈ 33 px |

## 9. Überlauf-Regeln (verbindlich)

1. Text in Buttons, Pills, Chips, Tabs, Navigation, Menüeinträgen, Tabellenköpfen steht in `<Label>`
   (`<span class="lbl">`: Einzeiler, Ellipse, `min-width: 0`). Ist er abgeschnitten, steht der volle Text im `title`.
2. Maximalbreiten: Button, Pill, Chip, Tab `min(100%, 15rem)` (`--w-ctl-max`), Zähler `5ch`, Menü `min(20rem, 100vw − 16px)`,
   Tabellenzelle `32rem` mit Umbruch. Kein Element ist breiter als sein Container.
3. Ellipse: Steuerelemente, Listenzeilen, Kartennamen, Zonennamen. Umbruch: Fließtext, Fehlermeldungen von Reksio,
   Toasts, Karten-Titel (höchstens 2 Zeilen). Wörter ohne Leerzeichen (Seriennummer, IDs): `overflow-wrap: anywhere`.
4. Jedes Flex-/Grid-Kind mit Text hat `min-width: 0`; Grid-Spuren `minmax(0, 1fr)`, `auto-fill` mit
   `minmax(min(<Breite>, 100%), 1fr)`. In Zeilen mit Text schrumpfen Steuerelemente zuerst.
5. Prüftext: `Wärmeerzeugerbestandsaufnahmeprotokoll Zusammenfassung` (DE) bzw.
   `Incomprehensibilities Characteristically Uncharacteristic` (EN), in 320 px, behaglich und kompakt, hell und dunkel.

## 10. Barrierefreiheit

Kontraste nach §3.6 · sichtbarer Fokus (`:focus-visible`) · Tab-Reihenfolge = Lesereihenfolge · ARIA für Menüs, Dialoge
(Fokus-Falle, Esc, Fokus zurück), Tabs, Segment-Controls · Live-Werte in `aria-live="polite"` nur bei Zustandswechsel
(nicht bei jeder Messung) · Fehler von Reksio als `role="alert"` · Reduced Motion (§7) · Touch ≥ 44 px · Farbe nie allein ·
200 % Zoom und 320 px ohne waagerechtes Scrollen · Karte: Steuerung (Zoom, Einpassen) per Tastatur, Zonen auch als Liste bedienbar.

## 11. Layout und Navigation

| | Desktop / Laptop (> 900 px) | Tablet (641–900 px) | Handy (≤ 640 px) |
|---|---|---|---|
| Navigation | Seitenleiste links (Übersicht, Karte, Reinigungen, Zeitplan) | schmale Seitenleiste (nur Icons, Tooltip) | Leiste unten, 4 Einträge |
| Kopf | Seitentitel, Stand, Aktualisieren, Hell/Dunkel, Einstellungen | wie Desktop | Name + Status-Pill, Hell/Dunkel, Einstellungen |
| Inhalt | zwei Spalten: Karte + Reinigungen links, Steuerung + Akku rechts | einspaltig, Steuerung und Akku zuerst | einspaltig, Steuerung und Akku zuerst |
| Detail | Panel rechts oder Dialog | Dialog | Vollbildseite mit Zurück |

Seitenaufbau: Titel (H1) · rechts „Stand hh:mm“ + Aktualisieren · darunter Karten. Karte = `surface`, Radius `l`, Kopfzeile
mit Icon, Titel (H3) und rechts Status-Pill oder Aktion.

**Einstellungen** liegen auf allen Größen oben (Zahnrad neben Hell/Dunkel), nicht in der Navigation. Hell und Dunkel gibt es
auf allen Plattformen, umschaltbar oben und in den Einstellungen (System · Hell · Dunkel).

**Handy:** Die Bedienleiste für Reksio (Start/Pause, Stopp, Zur Basis) sitzt auf der Übersicht oben im ersten Bildschirm, nicht
in einem Menü. Motorwerte stehen unter Einstellungen → Diagnose, nicht auf der Übersicht.

## 12. Muster für Reksio

### 12.1 Status

Der Status kommt aus `getRobotState` (`state`, `action`, `details`) und wird auf ein Wort und einen Ton abgebildet:

| Lage | Wort (DE / EN) | Ton |
|---|---|---|
| bereit, angedockt, voll | Bereit / Ready | ok |
| lädt (ohne Reinigung) | Lädt / Charging | info |
| reinigt (Haus, Spot, Zone) | Reinigt / Cleaning | info |
| lädt während der Reinigung | Lädt, setzt fort / Charging, will resume | info |
| pausiert | Pausiert / Paused | warn |
| fährt zur Basis | Zur Basis / Returning | info |
| erkundet die Karte | Erkundet / Exploring | info |
| Hinweis (`alert`) | Text des Hinweises | warn |
| Fehler (`error`, ESP `hasError`) | Text des Fehlers | danger |
| keine Verbindung zum Server oder Reksio getrennt | Offline | neutral (`text-3`), Symbol `WifiOff` |

Knöpfe folgen `availableCommands`: nicht verfügbare Befehle sind ausgeblendet, nicht ausgegraut (außer in der festen
Bedienleiste, dort deaktiviert, damit sie nicht springt).

### 12.2 Akku

Kennzahl in % (Display), daneben das Akku-Icon nach Stand; Ton: ≥ 30 % neutral, 15–29 % warn, < 15 % danger.
Darunter in Small/`text-2`: Spannung (V), Strom (mA, negativ = Entladen), Temperatur (°C), soweit der ESP sie liefert.
Lädt Reksio, steht „lädt“ und, wenn bekannt, die Zeit bis voll.

### 12.3 Frische der Daten

| Quelle | Erwartet | Veraltet ab | Anzeige |
|---|---|---|---|
| Reksio (Cloud-Protokoll) | Ereignis bei Änderung | Verbindung getrennt | Pill „Offline“ |
| ESP-Telemetrie | alle 10 s | 30 s | Werte in `text-3`, Zusatz „Stand hh:mm:ss“ |
| Position | alle 2 s während der Reinigung | 10 s | Reksio-Punkt hohl statt gefüllt |

### 12.4 Karte

- Die Punkte werden **einmal** in 4 Pixeln pro Zelle vorgerendert (je Thema). Rausgezoomt wird nur dieses Bild skaliert;
  ab mehr als 5 Pixeln pro Zelle werden nur die sichtbaren Punkte live gezeichnet, damit sie scharf bleiben.
  Zonen, No-Go-Linien, Basis und Position liegen als Vektoren darüber.
- Fahrten (Reinigungen) liegen über der Bodenkarte mit derselben ID; beide haben dasselbe Raster.
- Bedienung: Mausrad/Pinch zoomt um den Zeiger, Ziehen verschiebt, Doppelklick zoomt hinein, Knopf „Einpassen“.
  Zoom zwischen „ganze Karte“ und 8 Pixeln pro Kartenpixel.
- Ebenen von unten: unbekannt · befahrbar · Wand · Zonen · Spur · No-Go-Linien · Basis · Reksio.
- Die Karte füllt ihre Karte ganz; am Handy volle Breite, Höhe mindestens 60 % des Bildschirms.

### 12.5 Zahlen, Einheiten, Zeit

| Größe | Format DE | Format EN |
|---|---|---|
| Akku | `47 %` | `47%` |
| Spannung, Strom, Temperatur | `14,2 V` · `−1.985 mA` · `25,2 °C` | `14.2 V` · `−1,985 mA` · `25.2 °C` |
| Fläche, Strecke | `42 m²` · `310 m` | `42 m²` · `310 m` |
| Dauer | `1 h 12 min` | `1 h 12 min` |
| Verbrauch | `38 %/h` | `38%/h` |
| Zeitpunkt | heute `14:12`, sonst `29.10. 14:12`, älter als ein Jahr mit Jahr | `2:12 PM`, `Oct 29, 2:12 PM` |
| relativ (nur zusätzlich) | `vor 5 min` | `5 min ago` |

Formatierung über `Intl` mit der Sprache der Oberfläche und der Zeitzone des Servers.

### 12.6 Reinigungen

Liste mit Datum, Dauer, Fläche, Akkuverbrauch. Detail: Bodenkarte mit Spur und Akkukurve.

**Akkukurve** (Übersicht: letzte 3 h): Linie Slot 1, y-Achse 0 / 50 / 100 % mit Gitterlinien, x-Achse Uhrzeit (volle bzw.
halbe Stunden), Ladephasen als `info-soft`-Band, Zeiger mit Wert und Uhrzeit beim Darüberfahren.

## 13. Sprache (DE / EN)

- Deutsch ist Standard, Englisch umschaltbar; Erkennung über die Browsersprache, Einstellung überschreibt.
- Alle Texte über Schlüssel (`web/src/i18n/de.ts`, `en.ts`); TypeScript prüft, dass beide Sprachen dieselben Schlüssel haben.
- Beschriftungen 1–3 Wörter, Aktionen als Verb („Starten“ / „Start“, „Zur Basis“ / „Dock“), Zustände als Wort.
- Englische Texte sind oft kürzer, deutsche länger: Layouts werden mit dem deutschen Prüftext (§9) abgenommen.
- Fehlermeldungen von Reksio werden übersetzt, wenn der Code bekannt ist, sonst der Originaltext.

## 14. Prüfung

| Prüfung | Erwartung |
|---|---|
| `npm run check` in `web/` (TypeScript, Lint) | grün |
| Überlauf-Test (Playwright): jede Seite in 1280 / 820 / 390 / 320 px, hell/dunkel, behaglich/kompakt, DE mit Prüftext | 0 Elemente ragen aus ihrem Container, keine Seite scrollt waagerecht |
| Screenshots hell/dunkel × Handy/Desktop je Seite | Sichtprüfung vor jedem Deploy |
| Kontrast-Skript gegen `tokens.css` | alle Paare aus §3.6 erreicht |
| Karte: 60 fps beim Zoomen auf dem Handy (Chrome DevTools, 4× CPU-Drosselung) | keine langen Frames > 50 ms |

## 15. Bewusste Abweichungen und offene Punkte

| Punkt | Stand |
|---|---|
| Rahmen von Eingabefeldern hell 1,5:1 | akzeptiert (§3.6) |
| Live-Position auf der gespeicherten Karte | wartet auf Schritt 0 (Drehung je Karte), siehe `docs/step0-koordinaten.md` |
| Logo | Platzhalter (Icon `Bot` im Akzent) |
| Hoher Kontrast (`data-contrast="more"`) | Rahmen und `text-2/3` verstärkt; Werte folgen mit der ersten Umsetzung |

## 16. Änderungen

Token ändern: `tokens.css` und dieses Dokument zusammen, Kontrast-Skript laufen lassen, alle vier Kombinationen ansehen.
Neue Komponente: Beschriftung über `Label`, Maximalbreite aus §9, Fall im Überlauf-Test ergänzen.
