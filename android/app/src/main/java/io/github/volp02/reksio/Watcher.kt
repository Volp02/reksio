package io.github.volp02.reksio

/** Stand des Roboters (Telemetrie des ESP über den Server); `null` = nicht erreichbar. */
data class Status(
    val uiState: String,
    val robotState: String,
    val hasError: Boolean = false,
    val errorMessage: String = "",
    val fuelPercent: Int? = null,
    /** Codes aus GetErr, z. B. UI_ALERT_RECOVERING_LOCATION; leer = nur errorMessage auswerten */
    val codes: List<String> = emptyList(),
)

enum class Level { INFO, WARNUNG }

data class Meldung(val text: String, val level: Level)

/**
 * Entscheidet aus aufeinanderfolgenden Statusabfragen, wann sich eine Meldung lohnt.
 * Reine Logik ohne Android, damit sie per Unit-Test prüfbar ist.
 */
class Watcher(private val offlineGrenzeMs: Long = 5 * 60_000L) {
    private var letzter: Status? = null
    private var letzterFehler = ""
    private var offlineSeit: Long? = null
    private var offlineGemeldet = false

    fun pruefen(status: Status?, jetzt: Long, zonen: Boolean = false): List<Meldung> {
        if (status == null) return offline(jetzt)
        val meldungen = mutableListOf<Meldung>()
        if (offlineGemeldet) meldungen += Meldung("Wieder erreichbar", Level.INFO)
        offlineSeit = null
        offlineGemeldet = false

        val fehler = fehlerText(status).orEmpty()
        if (fehler.isNotEmpty() && fehler != letzterFehler) meldungen += Meldung(fehler, Level.WARNUNG)
        letzterFehler = fehler

        val vorher = letzter?.uiState
        val jetztUi = status.uiState
        // während einer Zonenfolge meldet der Server Ergebnis und Ende selbst; Start/Ende jeder Zone wären zu viel
        if (vorher != null && vorher != jetztUi) uebergang(vorher, jetztUi)?.takeIf { !zonen || it.level == Level.WARNUNG }?.let { meldungen += it }
        letzter = status
        return meldungen
    }

    private fun offline(jetzt: Long): List<Meldung> {
        val seit = offlineSeit ?: jetzt.also { offlineSeit = it }
        // Nur melden, wenn er gerade unterwegs war; im Dock ist ein kurzer Ausfall egal.
        if (!offlineGemeldet && aktiv(letzter?.uiState) && jetzt - seit >= offlineGrenzeMs) {
            offlineGemeldet = true
            return listOf(Meldung("Keine Verbindung zum Roboter", Level.WARNUNG))
        }
        return emptyList()
    }

    private fun uebergang(vorher: String, jetzt: String): Meldung? = when {
        "PAUSED" in jetzt -> Meldung("Pausiert", Level.WARNUNG)
        "SUSPENDED" in vorher && "RUNNING" in jetzt -> Meldung("Fährt nach dem Laden weiter", Level.INFO)
        "DOCKING" in jetzt -> Meldung("Fährt zur Station", Level.INFO)
        "SUSPENDED" in jetzt -> Meldung("Lädt und macht danach weiter", Level.INFO)
        "CLEANINGRUNNING" in jetzt && !aktiv(vorher) -> Meldung("Gestartet", Level.INFO)
        aktiv(vorher) && !aktiv(jetzt) -> Meldung("Fertig", Level.INFO)
        else -> null
    }

    companion object {
        fun aktiv(ui: String?) = ui != null && ("CLEANING" in ui || "DOCKING" in ui)

        // nur Ablauf, keine Störung (wie QUIET_ALERTS in der Web-App)
        private val RUHIG = Regex("^UI_ALERT_(INVALID|RETURN_TO_|CHARGING_|BUSY_CHARGING|RECOVERING_LOCATION|INFO_THANK_YOU|TIME_SET|TIMER_|ENABLE_TIMER|LINKEDAPP|LOG|SWUPDATE_SUCCESS|ACQUIRING_PERSISTENT_MAP_IDS|CREATING_AND_UPLOADING_MAP|USB_DISCONNECTED|OLD_ERROR|WAIT_FOR_POWER_SWITCH_DETECT)")

        private val TEXTE = mapOf(
            "UI_ALERT_DUST_BIN_FULL" to "Staubbehälter voll",
            "UI_ALERT_BRUSH_CHANGE" to "Bürste tauschen",
            "UI_ALERT_FILTER_CHANGE" to "Filter tauschen",
            "UI_ERROR_DUST_BIN_MISSING" to "Staubbehälter fehlt",
            "UI_ERROR_DUST_BIN_FULL" to "Staubbehälter voll",
            "UI_ERROR_DUST_BIN_EMPTIED" to "Staubbehälter während der Reinigung entnommen",
            "UI_ERROR_PICKED_UP" to "Hochgehoben oder gekippt",
            "UI_ERROR_BUMPER_STUCK" to "Stoßfänger klemmt",
            "UI_ERROR_LWHEEL_STUCK" to "Linkes Rad blockiert",
            "UI_ERROR_RWHEEL_STUCK" to "Rechtes Rad blockiert",
            "UI_ERROR_BRUSH_STUCK" to "Hauptbürste blockiert",
            "UI_ERROR_BRUSH_OVERLOAD" to "Hauptbürste überlastet",
            "UI_ERROR_LDS_JAMMED" to "Laserturm blockiert",
            "UI_ERROR_UNABLE_TO_RETURN_TO_BASE" to "Basis nicht erreicht",
            "UI_ERROR_UNABLE_TO_SEE" to "Navigationssensoren verdeckt",
            "UI_ERROR_BATTERY_CRITICAL" to "Akku fast leer",
            "UI_ERROR_BATTERY_OVERTEMP" to "Akku zu heiß",
            "UI_ERROR_DECK_DEBRIS" to "Bürstenraum verschmutzt",
            "UI_ERROR_RDROP_STUCK" to "Rechter Absturzsensor klemmt",
            "UI_ERROR_LDROP_STUCK" to "Linker Absturzsensor klemmt",
            "UI_ERROR_HARDWARE_FAILURE" to "Hardwarefehler",
        )

        /** Text einer Störung, die eine Meldung wert ist; null = keine (oder nur Ablauf-Hinweis) */
        fun fehlerText(s: Status): String? {
            if (!s.hasError) return null
            if (s.codes.isEmpty()) return s.errorMessage.ifBlank { "Unbekannter Fehler" }
            val code = s.codes.firstOrNull { it.startsWith("UI_ERROR_") }
                ?: s.codes.firstOrNull { it.startsWith("UI_ALERT_") && !RUHIG.containsMatchIn(it) }
                ?: return null
            return TEXTE[code] ?: s.errorMessage.ifBlank { code.removePrefix("UI_").replace('_', ' ').lowercase() }
        }

        /** Meldung zu einem Ereignis des Servers (`notice`); null = keine Benachrichtigung */
        fun hinweis(typ: String, nichtGereinigt: List<String> = emptyList()): Meldung? = when (typ) {
            "zones_done" -> Meldung("Zonen fertig", Level.INFO)
            "zones_partial" -> Meldung("Zonen fertig · nicht gereinigt: ${nichtGereinigt.joinToString(", ")}", Level.WARNUNG)
            "zones_failed" -> Meldung("Zonen nicht gereinigt", Level.WARNUNG)
            "zones_stopped" -> Meldung("Zonenfolge abgebrochen", Level.INFO)
            "plan_started" -> Meldung("Zeitplan gestartet", Level.INFO)
            "plan_skipped" -> Meldung("Termin ausgelassen", Level.WARNUNG)
            "dustbin_emptied" -> Meldung("Staubbehälter geleert", Level.INFO)
            else -> null
        }

        /** Kurztext für die dauerhafte Benachrichtigung. */
        fun zusammenfassung(s: Status?): String {
            if (s == null) return "Nicht erreichbar"
            val ui = s.uiState
            val text = when {
                fehlerText(s) != null -> fehlerText(s)!!
                "PAUSED" in ui -> "Pausiert"
                "SUSPENDED" in ui -> "Lädt, macht danach weiter"
                "DOCKING" in ui -> "Fährt zur Station"
                "RUNNING" in ui -> "Unterwegs"
                "Charging" in s.robotState -> "Lädt"
                else -> "Bereit"
            }
            return s.fuelPercent?.let { "$text · $it %" } ?: text
        }
    }
}
