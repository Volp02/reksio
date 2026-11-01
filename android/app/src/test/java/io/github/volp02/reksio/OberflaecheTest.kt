package io.github.volp02.reksio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OberflaecheTest {
    @Test
    fun startseiteAusDerApp() {
        assertEquals("index.html", Oberflaeche.datei("/"))
        assertEquals("index.html", Oberflaeche.datei(""))
        assertEquals("index.html", Oberflaeche.datei("/index.html"))
        assertEquals("index.html", Oberflaeche.datei("/?x=1"))
    }

    @Test
    fun dateienAusDerApp() {
        assertEquals("assets/index-abc.js", Oberflaeche.datei("/assets/index-abc.js"))
        assertEquals("favicon.svg", Oberflaeche.datei("/favicon.svg"))
        assertEquals("text/javascript", Oberflaeche.typ("assets/index-abc.js"))
        assertEquals("font/woff2", Oberflaeche.typ("assets/outfit.woff2"))
    }

    @Test
    fun apiGehtAnDenServer() {
        assertNull(Oberflaeche.datei("/api/events"))
        assertNull(Oberflaeche.datei("/api/app/reksio.apk"))
        assertNull(Oberflaeche.datei("/api"))
        assertNull(Oberflaeche.datei("/assets/../../x.js"))
        assertNull(Oberflaeche.datei("/irgendwas"))
    }
}
