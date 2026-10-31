package io.github.volp02.reksio

import android.content.Context

/** Adresse des Reksio-Servers; gespeichert auf dem Gerät, beim ersten Start BuildConfig.VACUULA_URL (falls gesetzt). */
object Server {
    private const val PREFS = "reksio"
    private const val KEY = "server"

    fun adresse(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
            ?: BuildConfig.VACUULA_URL.takeIf { it.isNotBlank() }

    fun speichern(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, url).apply()
    }

    /** „192.168.1.5:8050“ → „http://192.168.1.5:8050“; null bei offensichtlich falscher Eingabe */
    fun normalisieren(eingabe: String): String? {
        var s = eingabe.trim().trimEnd('/')
        if (s.isEmpty() || ' ' in s) return null
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
        return s
    }
}
