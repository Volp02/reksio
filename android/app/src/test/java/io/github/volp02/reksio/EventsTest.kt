package io.github.volp02.reksio

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.BufferedReader
import java.io.StringReader

class EventsTest {
    @Test
    fun ereignisseUndKeepalive() {
        val strom = "event: robots\ndata: {\"a\":1}\n\n: keepalive\n\nevent: notice\ndata: {\"type\":\"zones_done\"}\n\n"
        val gelesen = mutableListOf<Pair<String, String>>()
        Events.lesen(BufferedReader(StringReader(strom))) { e, d -> gelesen += e to d }
        assertEquals(listOf("robots" to "{\"a\":1}", "notice" to "{\"type\":\"zones_done\"}"), gelesen)
    }

    @Test
    fun adresseNormalisieren() {
        assertEquals("http://192.168.1.5:8050", Server.normalisieren(" 192.168.1.5:8050/ "))
        assertEquals("https://x.y", Server.normalisieren("https://x.y"))
        assertEquals(null, Server.normalisieren("a b"))
    }
}
