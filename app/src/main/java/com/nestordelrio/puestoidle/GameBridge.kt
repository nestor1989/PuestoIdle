package com.nestordelrio.puestoidle

import android.util.Log
import android.webkit.JavascriptInterface
import java.util.Locale

/**
 * Lo que el juego (game.js) puede pedirle a Android, expuesto como window.PuestoNative.
 * Estos métodos corren en el hilo del puente JS: todo lo que toca la UI se pasa al hilo principal.
 * Android responde llamando a window.PuestoGame.* (ver MainActivity.callJs).
 * Cada método devuelve un valor neutro si algo falla, para que un error nativo no rompa el juego.
 */
class GameBridge(private val activity: MainActivity) {

    private inline fun <T> safe(fallback: T, block: () -> T): T =
        try {
            block()
        } catch (t: Throwable) {
            Log.w("PuestoBridge", "Error en el puente JS", t)
            fallback
        }

    @JavascriptInterface
    fun locale(): String = safe("es") { Locale.getDefault().toLanguageTag() }

    @JavascriptInterface
    fun isDebug(): Boolean = BuildConfig.DEBUG

    // Guardado nativo: SharedPreferences (entra en la copia de seguridad de Android).
    @JavascriptInterface
    fun load(): String = safe("") { activity.store.load() ?: "" }

    @JavascriptInterface
    fun save(json: String, remind: Boolean) = safe(Unit) {
        activity.store.save(json, remind)
    }

    @JavascriptInterface
    fun haptic(kind: String) = safe(Unit) {
        activity.haptic(kind)
    }

    // Anuncios: "boost" (hora pico) y "offline" (cobrar ×2) son recompensados; el intersticial va solo tras mudarse.
    @JavascriptInterface
    fun showRewarded(placement: String) = safe(Unit) {
        activity.ads.showRewarded(placement)
    }

    @JavascriptInterface
    fun showInterstitial() = safe(Unit) {
        activity.ads.showInterstitial()
    }

    @JavascriptInterface
    fun privacyOptionsRequired(): Boolean = safe(false) { activity.ads.privacyOptionsRequired() }

    @JavascriptInterface
    fun showPrivacyOptions() = safe(Unit) {
        activity.ads.showPrivacyOptions()
    }

    // Compra única "Sin anuncios" (producto no_ads en Play Console).
    @JavascriptInterface
    fun noAdsOwned(): Boolean = safe(false) { activity.billing.owned }

    @JavascriptInterface
    fun noAdsPrice(): String = safe("") { activity.billing.price() }

    @JavascriptInterface
    fun buyNoAds() = safe(Unit) {
        activity.buyNoAds()
    }

    @JavascriptInterface
    fun requestNotifications() = safe(Unit) {
        activity.requestNotifications()
    }
}
