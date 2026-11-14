package io.github.volp02.reksio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Hört im Hintergrund auf den Ereignisstrom des Servers (`/api/events`) und meldet Änderungen als Benachrichtigung:
 * Zustand und Störungen aus der Telemetrie (ESP), dazu die Hinweise des Servers (Zonen nicht gereinigt, Termin
 * ausgelassen, …) und die Meldungen von Gen4-Robotern ohne ESP (`robot_*`). Nur lesend, es geht kein Befehl an den Roboter.
 */
class WatchService : Service() {
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private val watcher = Watcher()
    private var naechsteId = 100
    @Volatile private var laeuft = false
    @Volatile private var generation = 0
    @Volatile private var verbindung: HttpURLConnection? = null

    // Zustand, nur im Handler-Thread
    private var status: Status? = null
    private var telemetrieAm = 0L
    private var serverDa = false
    private var zonen = false
    private var anmeldung = false
    /** Roboterliste des Servers (Seriennummer → Name, verbunden, Typ) und letzter Gen4-Zustand je Roboter */
    private var roboter: Map<String, JSONObject> = emptyMap()
    private val gen4Zustand = mutableMapOf<String, String>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        kanaeleAnlegen()
        thread = HandlerThread("reksio-watch").also { it.start() }
        handler = Handler(thread.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == AKTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val n = dauerNotification("Verbinde …")
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_DAUER, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_DAUER, n)
        }
        neuVerbinden()
        handler.removeCallbacksAndMessages(null)
        handler.post(::pruefen)
        return START_STICKY
    }

    override fun onDestroy() {
        laeuft = false
        verbindung?.disconnect()
        handler.removeCallbacksAndMessages(null)
        thread.quitSafely()
        super.onDestroy()
    }

    /** (Neu) mit dem Server verbinden, z. B. nach Adresswechsel */
    private fun neuVerbinden() {
        val g = ++generation
        laeuft = true
        verbindung?.disconnect()
        Thread({ lesen(g) }, "reksio-events").also { it.isDaemon = true; it.start() }
    }

    private fun lesen(g: Int) {
        var pause = 5_000L
        val aktuell = { laeuft && g == generation }
        while (aktuell()) {
            val basis = Server.adresse(this)
            var c: HttpURLConnection? = null
            if (basis != null) try {
                c = URL("$basis/api/events").openConnection() as HttpURLConnection
                // Anmeldung der Weboberfläche mitbenutzen (nur nötig, wenn auf dem Server ein Passwort gesetzt ist)
                runCatching { CookieManager.getInstance().getCookie(basis) }.getOrNull()?.let { c.setRequestProperty("Cookie", it) }
                c.connectTimeout = 10_000
                c.readTimeout = 60_000 // Server schickt alle 15 s ein Keepalive
                verbindung = c
                if (c.responseCode == 401) {
                    handler.post { anmeldung = true; aktualisieren() }
                } else if (c.responseCode == 200) {
                    handler.post { serverDa = true; anmeldung = false; aktualisieren() }
                    pause = 5_000L
                    c.inputStream.bufferedReader().use { r -> Events.lesen(r) { e, d -> if (aktuell()) handler.post { ereignis(e, d) } } }
                }
            } catch (e: Exception) {
                // nicht erreichbar oder Verbindung abgerissen: später erneut
            } finally {
                c?.disconnect()
                if (verbindung === c) verbindung = null
            }
            if (!aktuell()) return
            handler.post { serverDa = false; aktualisieren() }
            try { Thread.sleep(pause) } catch (e: InterruptedException) { return }
            pause = (pause * 2).coerceAtMost(60_000L)
        }
    }

    private fun ereignis(event: String, data: String) {
        val j = runCatching { JSONObject(data) }.getOrNull() ?: return
        val nm = getSystemService(NotificationManager::class.java)
        when (event) {
            "telemetry" -> {
                status = telemetrie(j)
                telemetrieAm = System.currentTimeMillis()
                for (m in watcher.pruefen(status, telemetrieAm, zonen)) melden(nm, m)
                aktualisieren()
            }
            "zones" -> zonen = j.optJSONObject("queue") != null
            "robots" -> {
                roboter = j.keys().asSequence().mapNotNull { k -> j.optJSONObject(k)?.let { k to it } }.toMap()
                // getrennt: alter Zustand gilt nicht mehr
                gen4Zustand.keys.retainAll { roboter[it]?.optBoolean("connected") == true }
                aktualisieren()
            }
            "notice" -> {
                Watcher.gen4Zustand(j.optString("type"), j.optString("code"))?.let {
                    gen4Zustand[j.optString("serial")] = it
                    aktualisieren()
                }
                val fehlend = j.optJSONArray("failed")?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
                Watcher.hinweis(j.optString("type"), fehlend, j.optString("code"), j.optString("name"))?.let { melden(nm, it) }
            }
        }
    }

    /** Telemetrie-Probe (gleicher Aufbau wie /api/state, /api/error, /api/charger des ESP) */
    private fun telemetrie(j: JSONObject): Status? {
        val state = j.optJSONObject("state") ?: return null
        val err = j.optJSONObject("error")
        val charger = j.optJSONObject("charger")
        val roh = err?.optString("errorMessage").orEmpty()
        return Status(
            uiState = state.optString("uiState"),
            robotState = state.optString("robotState"),
            hasError = err?.optBoolean("hasError") ?: false,
            errorMessage = err?.optString("displayMessage").orEmpty().ifBlank { roh },
            fuelPercent = charger?.takeIf { it.has("fuelPercent") }?.optInt("fuelPercent"),
            codes = CODE.findAll(roh).map { it.groupValues[1] }.toList(),
        )
    }

    /** alle 20 s: ohne Telemetrie (ESP oder Server weg) gilt der Roboter als nicht erreichbar */
    private fun pruefen() {
        val jetzt = System.currentTimeMillis()
        if (jetzt - telemetrieAm > TELEMETRIE_ALT_MS) {
            status = null
            val nm = getSystemService(NotificationManager::class.java)
            for (m in watcher.pruefen(null, jetzt, zonen)) melden(nm, m)
        }
        aktualisieren()
        handler.postDelayed(::pruefen, INTERVALL_MS)
    }

    private fun aktualisieren() {
        val text = when {
            anmeldung -> "Anmeldung nötig, App öffnen"
            !serverDa -> "Server nicht erreichbar"
            else -> Watcher.zusammenfassung(status, roboter.map { (serial, r) ->
                Roboter(r.optString("name").ifBlank { serial }, r.optBoolean("connected"), gen4Zustand[serial])
            })
        }
        getSystemService(NotificationManager::class.java).notify(ID_DAUER, dauerNotification(text))
    }

    private fun melden(nm: NotificationManager, m: Meldung) {
        val kanal = if (m.level == Level.WARNUNG) KANAL_WARNUNG else KANAL_INFO
        val n = Notification.Builder(this, kanal)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(m.text)
            .setContentIntent(appOeffnen())
            .setAutoCancel(true)
            .build()
        nm.notify(naechsteId++, n)
    }

    private fun dauerNotification(text: String): Notification {
        val stop = PendingIntent.getService(
            this, 1, Intent(this, WatchService::class.java).setAction(AKTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, KANAL_DAUER)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(appOeffnen())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, getString(R.string.stop), stop).build())
            .build()
    }

    private fun appOeffnen(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
    )

    private fun kanaeleAnlegen() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(KANAL_DAUER, getString(R.string.kanal_dauer), NotificationManager.IMPORTANCE_MIN),
        )
        nm.createNotificationChannel(
            NotificationChannel(KANAL_INFO, getString(R.string.kanal_info), NotificationManager.IMPORTANCE_DEFAULT),
        )
        nm.createNotificationChannel(
            NotificationChannel(KANAL_WARNUNG, getString(R.string.kanal_warnung), NotificationManager.IMPORTANCE_HIGH),
        )
    }

    companion object {
        private const val INTERVALL_MS = 20_000L
        private const val TELEMETRIE_ALT_MS = 60_000L
        private val CODE = Regex("""\((UI_(?:ALERT|ERROR)_[A-Z0-9_]+)\)""")
        private const val ID_DAUER = 1
        private const val KANAL_DAUER = "dauer"
        private const val KANAL_INFO = "info"
        private const val KANAL_WARNUNG = "warnung"
        private const val AKTION_STOP = "stop"

        fun starten(context: Context) {
            context.startForegroundService(Intent(context, WatchService::class.java))
        }
    }
}
