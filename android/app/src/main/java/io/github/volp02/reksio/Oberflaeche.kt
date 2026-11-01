package io.github.volp02.reksio

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.IOException

/**
 * Die Weboberfläche steckt in der App (assets/web, beim Bau aus web/dist kopiert). Die WebView lädt trotzdem die
 * Adresse des Servers, nur die Dateien der Oberfläche kommen aus der App: gleiche Herkunft wie der Server, also gehen
 * Anmeldung (Cookie), Ereignisströme und /api ohne CORS direkt an den Server. Ist der Server weg, startet die
 * Oberfläche trotzdem und zeigt das selbst an.
 */
object Oberflaeche {
    private const val ORDNER = "web"

    private val TYPEN = mapOf(
        "html" to "text/html",
        "js" to "text/javascript",
        "css" to "text/css",
        "svg" to "image/svg+xml",
        "png" to "image/png",
        "webp" to "image/webp",
        "woff2" to "font/woff2",
        "woff" to "font/woff",
        "json" to "application/json",
        "webmanifest" to "application/manifest+json",
    )

    /** Pfad der Datei in assets/web für eine Anfrage an den Server; null = an den Server durchreichen (/api usw.) */
    fun datei(pfad: String): String? {
        val p = pfad.substringBefore('?').ifEmpty { "/" }
        if (p == "/" || p == "/index.html") return "index.html"
        if (p.startsWith("/api/") || p == "/api" || ".." in p) return null
        return p.removePrefix("/").takeIf { it.isNotEmpty() && TYPEN.containsKey(it.substringAfterLast('.', "")) }
    }

    fun typ(datei: String): String = TYPEN[datei.substringAfterLast('.', "")] ?: "application/octet-stream"

    /** Antwort aus der App für eine Anfrage an den Server, oder null (Netz) */
    fun antwort(assets: AssetManager, server: String?, url: Uri): WebResourceResponse? {
        val basis = server?.let(Uri::parse) ?: return null
        if (url.scheme != basis.scheme || url.host != basis.host || url.port != basis.port) return null
        val datei = datei(url.encodedPath.orEmpty()) ?: return null
        val typ = typ(datei)
        val daten = try { assets.open("$ORDNER/$datei") } catch (e: IOException) { return null }
        return WebResourceResponse(typ, if (typ.startsWith("text/") || typ.endsWith("json")) "utf-8" else null, daten).apply {
            // index.html nie aus einem Cache, die gehashten Dateien ändern sich nur mit einer neuen App
            responseHeaders = mapOf("Cache-Control" to if (datei == "index.html") "no-store" else "max-age=31536000, immutable")
        }
    }
}
