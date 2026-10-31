package io.github.volp02.reksio

import java.io.BufferedReader

/** Liest einen Server-Sent-Events-Strom: ruft [aufEreignis] mit (event, data) je Ereignis auf. */
object Events {
    fun lesen(reader: BufferedReader, aufEreignis: (String, String) -> Unit) {
        var event = "message"
        val data = StringBuilder()
        while (true) {
            val zeile = reader.readLine() ?: return
            when {
                zeile.isEmpty() -> {
                    if (data.isNotEmpty()) aufEreignis(event, data.toString())
                    event = "message"
                    data.setLength(0)
                }
                zeile.startsWith(":") -> Unit // keepalive
                zeile.startsWith("event:") -> event = zeile.substring(6).trim()
                zeile.startsWith("data:") -> {
                    if (data.isNotEmpty()) data.append('\n')
                    data.append(zeile.substring(5).trimStart())
                }
            }
        }
    }
}
