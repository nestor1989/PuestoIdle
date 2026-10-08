package com.nestordelrio.puestoidle

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.webkit.WebViewAssetLoader

/**
 * Una sola pantalla: un WebView que carga el juego desde assets/www (sin red),
 * más los servicios nativos que el juego usa a través de [GameBridge].
 *
 * El WebView puede fallar de dos maneras que no dependen del juego, y ninguna debe cerrar la app:
 * - No se puede crear (WebView del sistema ausente, deshabilitado o actualizándose): se muestra un aviso con "Reintentar".
 * - Su proceso de dibujo muere (falta de memoria, falla de Chromium o un anuncio pesado, porque los anuncios
 *   también son WebView y comparten ese proceso): se descarta y se vuelve a cargar el juego desde el último guardado.
 */
class MainActivity : ComponentActivity() {

    private companion object {
        const val TAG = "Puesto"
        // Si el proceso del WebView muere más veces que esto en la misma apertura, se deja de reintentar solo.
        const val MAX_RENDERER_RESTARTS = 3
        val INK = Color.rgb(0x15, 0x21, 0x2A)
    }

    private val gameUrl = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/www/index.html"

    private lateinit var root: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private var webView: WebView? = null
    private var fallback: View? = null
    private var rendererRestarts = 0
    private var pageReady = false

    lateinit var store: SaveStore
        private set
    lateinit var ads: AdsManager
        private set
    lateinit var billing: BillingManager
        private set

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            callJs("PuestoGame.onNotifPermission($granted)")
        }

    // El juego cierra primero sus propios carteles; si no tiene nada abierto, sale.
    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            val view = webView ?: return exitBack()
            view.evaluateJavascript("window.PuestoGame ? PuestoGame.onBack() : false") { result ->
                if (result != "true") exitBack()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)

        store = SaveStore(this)
        ads = AdsManager(this) { js -> callJs(js) }
        billing = BillingManager(this, store) { js -> callJs(js) }

        root = FrameLayout(this).apply { setBackgroundColor(INK) }
        setContentView(root)

        // Edge-to-edge (obligatorio con targetSdk 35+): el juego queda dentro de las barras del sistema.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        onBackPressedDispatcher.addCallback(this, backCallback)

        createWebView()
        billing.start()
        ads.start()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = try {
            WebView(this)
        } catch (t: Throwable) {
            Log.e(TAG, "No se pudo crear el WebView", t)
            showFallback()
            return
        }
        try {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
            view.setBackgroundColor(INK)
            view.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = true
                textZoom = 100
                setSupportZoom(false)
            }
            view.overScrollMode = View.OVER_SCROLL_NEVER
            view.isHapticFeedbackEnabled = true
            view.webViewClient = GameClient()
            view.addJavascriptInterface(GameBridge(this), "PuestoNative")
        } catch (t: Throwable) {
            Log.e(TAG, "No se pudo preparar el WebView", t)
            runCatching { view.destroy() }
            showFallback()
            return
        }

        hideFallback()
        pageReady = false
        webView = view
        root.addView(view, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // Si se rearma con la app en segundo plano, queda en pausa hasta el próximo onResume.
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) view.onPause()
        view.loadUrl(gameUrl)
    }

    private inner class GameClient : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            assetLoader.shouldInterceptRequest(request.url)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
            // Cualquier enlace externo se abre fuera del juego.
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (view === webView) pageReady = true
        }

        // Android 8+: si ningún WebView devuelve true acá, el sistema cierra toda la app.
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.w(TAG, "El proceso del WebView terminó; se recarga el juego")
            if (view === webView) restartWebView() else runCatching { view.destroy() }
            return true
        }
    }

    /** Descarta el WebView cuyo proceso murió y carga el juego de nuevo (lee el último guardado). */
    private fun restartWebView() {
        val dead = webView ?: return
        webView = null
        pageReady = false
        root.removeView(dead)
        runCatching { dead.destroy() }
        if (isFinishing || isDestroyed) return
        rendererRestarts++
        if (rendererRestarts > MAX_RENDERER_RESTARTS) showFallback() else createWebView()
    }

    /** Aviso nativo para cuando el juego no puede mostrarse, con un botón para reintentar. */
    private fun showFallback() {
        if (fallback != null || isDestroyed) return
        val pad = dp(28)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
        }
        box.addView(TextView(this).apply {
            text = getString(R.string.webview_error)
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
        })
        box.addView(
            Button(this).apply {
                text = getString(R.string.retry)
                setOnClickListener {
                    hideFallback()
                    rendererRestarts = 0
                    createWebView()
                }
            },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(20) },
        )
        root.addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        fallback = box
    }

    private fun hideFallback() {
        fallback?.let { root.removeView(it) }
        fallback = null
    }

    private fun exitBack() {
        if (isDestroyed) return
        backCallback.isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        backCallback.isEnabled = true
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onStart() {
        super.onStart()
        Reminders.cancel(this)
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        if (pageReady) callJs("PuestoGame.onResume()")
    }

    override fun onPause() {
        if (pageReady) callJs("PuestoGame.onPause()")
        webView?.onPause()
        super.onPause()
    }

    override fun onStop() {
        super.onStop()
        if (store.shouldRemind) Reminders.schedule(this)
    }

    override fun onDestroy() {
        ads.destroy()
        billing.end()
        webView?.let { view ->
            root.removeView(view)
            runCatching { view.destroy() }
        }
        webView = null
        super.onDestroy()
    }

    fun callJs(js: String) {
        runOnUiThread {
            if (!isDestroyed) runCatching { webView?.evaluateJavascript(js, null) }
        }
    }

    fun haptic(kind: String) {
        runOnUiThread {
            val effect = when (kind) {
                "tick" -> HapticFeedbackConstants.KEYBOARD_TAP
                "confirm" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
                else -> HapticFeedbackConstants.LONG_PRESS
            }
            runCatching { webView?.performHapticFeedback(effect) }
        }
    }

    fun buyNoAds() {
        runOnUiThread {
            if (!isDestroyed && !billing.launch(this)) callJs("PuestoGame.onPurchase(false)")
        }
    }

    fun requestNotifications() {
        runOnUiThread {
            if (isDestroyed) return@runOnUiThread
            val needsPermission = Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            if (!needsPermission) {
                callJs("PuestoGame.onNotifPermission(true)")
                return@runOnUiThread
            }
            runCatching { notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }
                .onFailure { callJs("PuestoGame.onNotifPermission(false)") }
        }
    }
}
