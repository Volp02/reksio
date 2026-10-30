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
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fragt im Hintergrund die gecachten ESP-Endpunkte ab (`/api/state`, `/api/error`,
 * `/api/charger`) und meldet Änderungen als Benachrichtigung. Nur lesend: es geht
 * kein Befehl an den Roboter, und die Endpunkte belasten die serielle Leitung nicht.
 */
class WatchService : Service() {
    private lateinit var thread: HandlerThread
    private lateinit var handler: Handler
    private val watcher = Watcher()
    private var naechsteId = 100

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
        handler.removeCallbacksAndMessages(null)
        handler.post(::runde)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        thread.quitSafely()
        super.onDestroy()
    }

    private fun runde() {
        val status = abfragen()
        val nm = getSystemService(NotificationManager::class.java)
        for (m in watcher.pruefen(status, System.currentTimeMillis())) melden(nm, m)
        nm.notify(ID_DAUER, dauerNotification(Watcher.zusammenfassung(status)))
        handler.postDelayed(::runde, INTERVALL_MS)
    }

    private fun abfragen(): Status? = try {
        val state = JSONObject(get("/api/state"))
        val err = runCatching { JSONObject(get("/api/error")) }.getOrNull()
        val charger = runCatching { JSONObject(get("/api/charger")) }.getOrNull()
        Status(
            uiState = state.optString("uiState"),
            robotState = state.optString("robotState"),
            hasError = err?.optBoolean("hasError") ?: false,
            errorMessage = err?.optString("displayMessage").orEmpty()
                .ifBlank { err?.optString("errorMessage").orEmpty() },
            fuelPercent = charger?.takeIf { it.has("fuelPercent") }?.optInt("fuelPercent"),
        )
    } catch (e: Exception) {
        null
    }

    private fun get(pfad: String): String {
        val c = URL("http://${BuildConfig.ESP_HOST}$pfad").openConnection() as HttpURLConnection
        c.connectTimeout = 5000
        c.readTimeout = 5000
        try {
            if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
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
