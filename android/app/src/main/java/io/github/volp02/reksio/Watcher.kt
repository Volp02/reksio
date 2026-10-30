package io.github.volp02.reksio

/** Ein Abfrageergebnis vom ESP; `null` = nicht erreichbar. */
data class Status(
    val uiState: String,
    val robotState: String,
    val hasError: Boolean = false,
    val errorMessage: String = "",
    val fuelPercent: Int? = null,
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

    fun pruefen(status: Status?, jetzt: Long): List<Meldung> {
        if (status == null) return offline(jetzt)
        val meldungen = mutableListOf<Meldung>()
        if (offlineGemeldet) meldungen += Meldung("Wieder erreichbar", Level.INFO)
        offlineSeit = null
        offlineGemeldet = false

        val fehler = if (status.hasError) status.errorMessage.ifBlank { "Unbekannter Fehler" } else ""
        if (fehler.isNotEmpty() && fehler != letzterFehler) meldungen += Meldung(fehler, Level.WARNUNG)
        letzterFehler = fehler

        val vorher = letzter?.uiState
        val jetztUi = status.uiState
        if (vorher != null && vorher != jetztUi) uebergang(vorher, jetztUi)?.let { meldungen += it }
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

        /** Kurztext für die dauerhafte Benachrichtigung. */
        fun zusammenfassung(s: Status?): String {
            if (s == null) return "Nicht erreichbar"
            val ui = s.uiState
            val text = when {
                s.hasError -> s.errorMessage.ifBlank { "Fehler" }
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
