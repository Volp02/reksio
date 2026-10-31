package io.github.volp02.reksio

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL

/**
 * Zeigt die Reksio-Weboberfläche des Servers und startet den Wächter. Ohne gespeicherte Adresse oder wenn der Server
 * nicht antwortet, kommt die Einrichtung: Server im Netz suchen (mDNS, `_vacuula._tcp`) oder Adresse eingeben.
 * Die Web-App öffnet die Einrichtung über den Link `reksio-app://setup` (Einstellungen, nur in der App sichtbar).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var setup: View
    private lateinit var eingabe: EditText
    private lateinit var hinweis: TextView
    private lateinit var suchen: Button
    private lateinit var verbinden: Button
    private val main = Handler(Looper.getMainLooper())
    private var nsd: NsdManager? = null
    private var suche: NsdManager.DiscoveryListener? = null
    private var letzterCookie: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.userAgentString = "${web.settings.userAgentString} ReksioApp/${BuildConfig.VERSION_NAME}"
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "reksio-app") {
                    if (request.url.host == "setup") zeigeSetup(null)
                    return true
                }
                if (request.url.host == Server.adresse(this@MainActivity)?.let { Uri.parse(it).host }) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                // Anmeldung für den Wächter sichern; nach einer Anmeldung neu verbinden
                CookieManager.getInstance().flush()
                val cookie = CookieManager.getInstance().getCookie(url).orEmpty()
                if (cookie != letzterCookie) { letzterCookie = cookie; WatchService.starten(this@MainActivity) }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) zeigeSetup(getString(R.string.setup_offline, Server.adresse(this@MainActivity)))
            }
        }
        setup = setupAnsicht()
        setContentView(FrameLayout(this).apply {
            addView(web)
            addView(setup)
        })

        val adresse = Server.adresse(this)
        if (adresse == null) zeigeSetup(null)
        else if (savedInstanceState == null) laden(adresse) else { web.restoreState(savedInstanceState); setup.visibility = View.GONE }

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        if (adresse != null) WatchService.starten(this)
    }

    private fun laden(adresse: String) {
        setup.visibility = View.GONE
        web.visibility = View.VISIBLE
        web.loadUrl(adresse)
    }

    private fun zeigeSetup(meldung: String?) {
        eingabe.setText(Server.adresse(this).orEmpty())
        hinweis.text = meldung.orEmpty()
        setup.visibility = View.VISIBLE
        web.visibility = View.GONE
    }

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun setupAnsicht(): View {
        val farbe = getColor(R.color.text)
        val farbe2 = getColor(R.color.text2)
        eingabe = EditText(this).apply {
            hint = getString(R.string.setup_adresse)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setSingleLine()
            setTextColor(farbe)
            setOnEditorActionListener { _, id, _ -> (id == EditorInfo.IME_ACTION_GO).also { if (it) pruefenUndSpeichern() } }
        }
        hinweis = TextView(this).apply { setTextColor(farbe2); setPadding(0, dp(8), 0, dp(8)) }
        suchen = Button(this).apply { text = getString(R.string.setup_suchen); setOnClickListener { suchen() } }
        verbinden = Button(this).apply { text = getString(R.string.setup_verbinden); setOnClickListener { pruefenUndSpeichern() } }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
            setBackgroundColor(getColor(R.color.hintergrund))
            addView(TextView(context).apply {
                text = getString(R.string.setup_titel)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
                setTextColor(farbe)
                setPadding(0, 0, 0, dp(16))
            })
            addView(eingabe)
            addView(hinweis)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(suchen, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                addView(verbinden, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            })
            addView(TextView(context).apply {
                text = getString(R.string.setup_version, BuildConfig.VERSION_NAME)
                setTextColor(farbe2)
                setPadding(0, dp(24), 0, 0)
            })
        }
    }

    /** Adresse prüfen (GET /api/server), speichern, App laden und Wächter neu verbinden */
    private fun pruefenUndSpeichern() {
        val url = Server.normalisieren(eingabe.text.toString()) ?: run { hinweis.text = getString(R.string.setup_falsch); return }
        hinweis.text = getString(R.string.setup_prueft)
        verbinden.isEnabled = false
        Thread {
            val ok = runCatching {
                val c = URL("$url/api/server").openConnection() as HttpURLConnection
                c.connectTimeout = 5000
                c.readTimeout = 5000
                try { c.responseCode == 200 } finally { c.disconnect() }
            }.getOrDefault(false)
            main.post {
                verbinden.isEnabled = true
                if (!ok) { hinweis.text = getString(R.string.setup_offline, url); return@post }
                Server.speichern(this, url)
                laden(url)
                WatchService.starten(this)
            }
        }.start()
    }

    /** Server per mDNS suchen; der erste gefundene wird eingetragen */
    private fun suchen() {
        val m = getSystemService(NsdManager::class.java) ?: return
        stopSuche()
        nsd = m
        hinweis.text = getString(R.string.setup_sucht)
        suchen.isEnabled = false
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { main.post { nichtsGefunden() } }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceLost(info: NsdServiceInfo) {}
            override fun onServiceFound(info: NsdServiceInfo) {
                @Suppress("DEPRECATION")
                m.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {}
                    override fun onServiceResolved(info: NsdServiceInfo) {
                        @Suppress("DEPRECATION")
                        val host = info.host?.hostAddress ?: return
                        main.post {
                            if (suche == null) return@post
                            stopSuche()
                            val url = "http://$host:${info.port}"
                            eingabe.setText(url)
                            hinweis.text = getString(R.string.setup_gefunden, url)
                        }
                    }
                })
            }
        }
        suche = listener
        m.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, listener)
        main.postDelayed({ if (suche === listener) { stopSuche(); nichtsGefunden() } }, SUCHE_MS)
    }

    private fun nichtsGefunden() {
        suchen.isEnabled = true
        hinweis.text = getString(R.string.setup_nichts)
    }

    private fun stopSuche() {
        suche?.let { l -> runCatching { nsd?.stopServiceDiscovery(l) } }
        suche = null
        suchen.isEnabled = true
    }

    override fun onDestroy() {
        stopSuche()
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    @Deprecated("Activity ohne AndroidX")
    override fun onBackPressed() {
        when {
            setup.visibility == View.VISIBLE && Server.adresse(this) != null && web.url != null -> {
                setup.visibility = View.GONE; web.visibility = View.VISIBLE
            }
            web.canGoBack() -> web.goBack()
            else -> super.onBackPressed()
        }
    }

    companion object {
        private const val SERVICE = "_vacuula._tcp."
        private const val SUCHE_MS = 8_000L
    }
}
