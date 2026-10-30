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
}
