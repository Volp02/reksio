package io.github.volp02.reksio

import org.junit.Assert.assertEquals
import org.junit.Test

class WatcherTest {
    private fun s(ui: String, robot: String = "", fehler: String? = null) =
        Status(ui, robot, hasError = fehler != null, errorMessage = fehler.orEmpty())

    private fun texte(w: Watcher, status: Status?, t: Long = 0) = w.pruefen(status, t).map { it.text }

    @Test
    fun ersteAbfrageMeldetNichts() {
        assertEquals(emptyList<String>(), texte(Watcher(), s("UIMGR_STATE_CLEANINGSUSPENDED")))
    }

    @Test
    fun ablaufEinerErkundung() {
        val w = Watcher()
        texte(w, s("UIMGR_STATE_CLEANINGSUSPENDED", "ST_M1_Charging_Cleaning"))
        assertEquals(listOf("Fährt nach dem Laden weiter"), texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING")))
        assertEquals(listOf("Fährt zur Station"), texte(w, s("UIMGR_STATE_DOCKINGRUNNING")))
        assertEquals(listOf("Lädt und macht danach weiter"), texte(w, s("UIMGR_STATE_CLEANINGSUSPENDED")))
        texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING"))
        texte(w, s("UIMGR_STATE_DOCKINGRUNNING"))
        assertEquals(listOf("Fertig"), texte(w, s("UIMGR_STATE_IDLE", "ST_C_Standby")))
    }

    @Test
    fun fehlerNurEinmal() {
        val w = Watcher()
        texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING"))
        assertEquals(listOf("Bitte befreien"), texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING", fehler = "Bitte befreien")))
        assertEquals(emptyList<String>(), texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING", fehler = "Bitte befreien")))
    }

    @Test
    fun offlineNurWennUnterwegsUndNachGrenze() {
        val w = Watcher(offlineGrenzeMs = 1000)
        texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING"))
        assertEquals(emptyList<String>(), texte(w, null, 0))
        assertEquals(listOf("Keine Verbindung zum Roboter"), texte(w, null, 1000))
        assertEquals(emptyList<String>(), texte(w, null, 5000))
        assertEquals(listOf("Wieder erreichbar"), texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING"), 6000))

        val dock = Watcher(offlineGrenzeMs = 1000)
        texte(dock, s("UIMGR_STATE_IDLE"))
        assertEquals(emptyList<String>(), texte(dock, null, 0) + texte(dock, null, 9999))
    }

    @Test
    fun ablaufHinweiseSindKeineStoerung() {
        val w = Watcher()
        texte(w, s("UIMGR_STATE_HOUSECLEANINGRUNNING"))
        val zurueck = Status("UIMGR_STATE_HOUSECLEANINGRUNNING", "", hasError = true, errorMessage = "Returning to base",
            codes = listOf("UI_ALERT_RETURN_TO_BASE"))
        assertEquals(emptyList<String>(), texte(w, zurueck))
        val klemmt = zurueck.copy(errorMessage = "Robot is picked up", codes = listOf("UI_ALERT_INVALID", "UI_ERROR_PICKED_UP"))
        assertEquals(listOf("Hochgehoben oder gekippt"), texte(w, klemmt))
    }

    @Test
    fun zonenfolgeOhneStartUndEndeJederZone() {
        val w = Watcher()
        w.pruefen(s("UIMGR_STATE_IDLE"), 0, zonen = true)
        assertEquals(emptyList<String>(), w.pruefen(s("UIMGR_STATE_HOUSECLEANINGRUNNING"), 1, zonen = true).map { it.text })
        assertEquals(emptyList<String>(), w.pruefen(s("UIMGR_STATE_IDLE"), 2, zonen = true).map { it.text })
    }

    @Test
    fun hinweiseDesServers() {
        assertEquals("Zonen fertig · nicht gereinigt: Flur, Bad", Watcher.hinweis("zones_partial", listOf("Flur", "Bad"))?.text)
        assertEquals(Level.WARNUNG, Watcher.hinweis("plan_skipped")?.level)
        assertEquals(null, Watcher.hinweis("telemetry"))
    }

    @Test
    fun gen4MitNamen() {
        assertEquals("D8: Linkes Rad in der Luft", Watcher.hinweis("robot_error", code = "lw_hanging", name = "D8")?.text)
        assertEquals(Level.WARNUNG, Watcher.hinweis("robot_error", code = "lw_hanging")?.level)
        assertEquals("D8: Fertig", Watcher.hinweis("robot_finished", name = "D8")?.text)
        assertEquals("Update fehlgeschlagen", Watcher.hinweis("robot_error", code = "swu_error_internal")?.text)
        assertEquals("Neuer code", Watcher.hinweis("robot_error", code = "neuer_code")?.text)
        assertEquals("Zonen fertig", Watcher.hinweis("zones_done", name = "D8")?.text)
    }

    @Test
    fun ohneTelemetrieZaehlenVerbundeneRoboter() {
        assertEquals("Nicht erreichbar", Watcher.zusammenfassung(null))
        assertEquals("Nicht erreichbar", Watcher.zusammenfassung(null, listOf(Roboter("Reksio", verbunden = false))))
        assertEquals("D9: verbunden", Watcher.zusammenfassung(null, listOf(Roboter("Reksio", false), Roboter("D9", true))))
        assertEquals("D9: Unterwegs", Watcher.zusammenfassung(null, listOf(Roboter("D9", true, Watcher.gen4Zustand("robot_started")))))
        assertEquals("Bereit", Watcher.gen4Zustand("robot_finished"))
        assertEquals(null, Watcher.gen4Zustand("robot_offline"))
    }
}
