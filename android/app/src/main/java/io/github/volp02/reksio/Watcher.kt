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

        // Fehlercodes der Gen4-Roboter (D8–D10), wie web/src/i18n/gen4codes.ts
        private val GEN4 = mapOf(
            "return_to_base" to "Fährt zur Basis",
            "return_to_base_pwr" to "Akku schwach, fährt zum Laden",
            "return_to_start" to "Fährt zum Startpunkt",
            "return_to_charge" to "Fährt zum Laden",
            "busy_charging" to "Lädt, setzt danach fort",
            "recovering_location" to "Orientiert sich",
            "charging_power" to "Lädt",
            "charging_base" to "Lädt an der Basis",
            "origin_unclean" to "Startpunkt nicht gereinigt",
            "brush_change" to "Bürste tauschen",
            "filter_change" to "Filter tauschen",
            "persistent_relocalization_fail" to "Position auf der Karte nicht gefunden",
            "training_multiple_floorplans_valid" to "Mehrere Karten passen",
            "multiple_floorplans_valid" to "Mehrere Karten passen zu diesem Ort",
            "pm_load_fail" to "Karte nicht geladen",
            "pm_setup_fail" to "Karte nicht vorbereitet",
            "acquiring_persistent_map_ids" to "Bereitet die Karte vor",
            "creating_and_uploading_map" to "Erstellt und sendet die Karte",
            "pm_start_clean_fail" to "Reinigung mit Karte nicht gestartet",
            "nav_floorplan_not_created" to "Karte noch nicht erstellt",
            "nav_floorplan_zone_unreachable" to "Zone nicht erreichbar",
            "nav_floorplan_zone_wrong_floor" to "Zone liegt auf einer anderen Etage",
            "nav_floorplan_load_fail" to "Karte nicht geladen",
            "nav_floorplan_localization_fail" to "Position auf der Karte nicht gefunden",
            "nav_floorplan_zone_path_blocked" to "Weg zur Zone versperrt",
            "nav_floorplan_setup_fail" to "Karte nicht vorbereitet",
            "training_map_sparse" to "Karte unvollständig",
            "dustbin_emptied" to "Staubbehälter geleert",
            "dustbin_full" to "Staubbehälter voll",
            "dustbin_missing" to "Staubbehälter fehlt",
            "unable_to_return_to_base" to "Basis nicht erreicht",
            "bumper_stuck" to "Stoßfänger klemmt",
            "picked_up" to "Hochgehoben",
            "reconnect_failed" to "Keine Verbindung zur Basis",
            "brush_overload" to "Bürste überlastet",
            "vacuum_stuck" to "Saugmotor blockiert",
            "vacuum_slip" to "Problem am Saugmotor",
            "lw_hanging" to "Linkes Rad in der Luft",
            "rw_hanging" to "Rechtes Rad in der Luft",
            "lw_jammed" to "Linkes Rad blockiert",
            "rw_jammed" to "Rechtes Rad blockiert",
            "imu_tilt" to "Gekippt",
            "main_brush_overcurrent" to "Hauptbürste überlastet",
            "main_brush_stuck" to "Hauptbürste blockiert",
            "side_brush_overcurrent" to "Seitenbürste überlastet",
            "navigation_undocking_failed" to "Kommt nicht von der Basis weg",
            "navigation_falling" to "An einer Kante",
            "navigation_backdrop_leftbump" to "Zu nah an einer Kante",
            "navigation_backdrop_frontbump" to "Zu nah an einer Kante",
            "navigation_backdrop_wheelextended" to "Zu nah an einer Kante",
            "navigation_rightdrop_leftbump" to "Kante erkannt",
            "navigation_no_exits_to_go" to "Eingeschlossen",
            "navigation_path_problems_returning_home" to "Findet den Weg zur Basis nicht",
            "navigation_no_progress" to "Kommt nicht weiter",
            "navigation_path_blocked_going_to_zone" to "Weg zur Zone versperrt",
            "lds_stream_error" to "Problem am Laserturm",
            "lds_no_rpm_data" to "Laserturm dreht sich nicht",
            "lds_jammed" to "Laserturm blockiert",
            "hardware_failure" to "Hardwarefehler",
            "shutdown" to "Schaltet sich aus",
            "deck_debris" to "Schmutz unter dem Roboter",
            "rdrop_stuck" to "Rechter Absturzsensor klemmt",
            "ldrop_stuck" to "Linker Absturzsensor klemmt",
            "bdrop_stuck" to "Hinterer Absturzsensor klemmt",
            "unable_to_see" to "Sensoren verdeckt",
            "tilted_on_cleaning_startup" to "Beim Start gekippt",
            "flight_sensor_disconnected" to "Abstandssensor getrennt",
            "hardware_comms_failure" to "Interner Verbindungsfehler",
            "battery_failure" to "Akkuproblem",
            "sw_upgrade_failure" to "Update fehlgeschlagen",
            "no_router_connection" to "Keine WLAN-Verbindung",
            "no_server_connection" to "Keine Verbindung zum Server",
            "needs_to_recharge" to "Muss erst laden",
            "confirm_start_after_charge" to "Setzt nach dem Laden fort",
            "battery_overtemp" to "Akku zu heiß",
            "tof_stream_error" to "Problem am Abstandssensor",
            "lw_hanging_on_cleaning_startup" to "Linkes Rad beim Start in der Luft",
            "rw_hanging_on_cleaning_startup" to "Rechtes Rad beim Start in der Luft",
            "routine_cleaning_start" to "Geplante Reinigung startet",
            "routine_cleaning_start_offbase_error" to "Geplante Reinigung nicht gestartet: nicht auf der Basis",
            "routine_cleaning_start_low_battery_error" to "Geplante Reinigung nicht gestartet: Akku schwach",
        )

        /** Text zu einem Gen4-Code; Updates zusammengefasst, Unbekanntes lesbar gemacht */
        fun gen4Text(code: String): String = when {
            code.startsWith("swu_") || code.startsWith("tron_") -> "Update fehlgeschlagen"
            else -> GEN4[code] ?: code.replace('_', ' ').replaceFirstChar { it.uppercase() }
        }

        /**
         * Meldung zu einem Ereignis des Servers (`notice`); null = keine Benachrichtigung.
         * Gen4-Roboter melden sich nur so (kein ESP): `robot_*` mit Namen des Roboters davor.
         */
        fun hinweis(typ: String, nichtGereinigt: List<String> = emptyList(), code: String = "", name: String = ""): Meldung? {
            val m = roboter(typ, code) ?: return allgemein(typ, nichtGereinigt)
            return if (name.isBlank()) m else m.copy(text = "$name: ${m.text}")
        }

        private fun roboter(typ: String, code: String): Meldung? = when (typ) {
            "robot_started" -> Meldung("Gestartet", Level.INFO)
            "robot_finished" -> Meldung("Fertig", Level.INFO)
            "robot_paused" -> Meldung("Pausiert", Level.WARNUNG)
            "robot_returning" -> Meldung("Fährt zur Station", Level.INFO)
            "robot_charging_resume" -> Meldung("Lädt und macht danach weiter", Level.INFO)
            "robot_resumed" -> Meldung("Fährt nach dem Laden weiter", Level.INFO)
            "robot_error" -> Meldung(gen4Text(code), Level.WARNUNG)
            "robot_offline" -> Meldung("Keine Verbindung zum Roboter", Level.WARNUNG)
            else -> null
        }

        private fun allgemein(typ: String, nichtGereinigt: List<String>): Meldung? = when (typ) {
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
