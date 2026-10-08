package com.nestordelrio.puestoidle

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AdMob: primero el consentimiento (UMP, obligatorio en el EEE y el Reino Unido), después los anuncios.
 * Solo dos formatos: recompensado (siempre opcional) e intersticial (el juego decide cuándo; ver game.js).
 * Un error de los SDK de anuncios nunca cierra el juego: se registra y el juego sigue sin ese anuncio.
 */
class AdsManager(private val activity: Activity, private val callJs: (String) -> Unit) {

    private companion object {
        const val TAG = "PuestoAds"
    }

    private val main = Handler(Looper.getMainLooper())
    private val consent: ConsentInformation = UserMessagingPlatform.getConsentInformation(activity)
    private val started = AtomicBoolean(false)

    @Volatile
    private var destroyed = false
    private val alive: Boolean get() = !destroyed && !activity.isFinishing && !activity.isDestroyed

    private var rewarded: RewardedAd? = null
    private var interstitial: InterstitialAd? = null
    private var loadingRewarded = false
    private var loadingInterstitial = false
    private var rewardedRetrySec = 0L
    private var interstitialRetrySec = 0L

    fun start() {
        val params = ConsentRequestParameters.Builder().build()
        try {
            consent.requestConsentInfoUpdate(
                activity,
                params,
                { showConsentFormIfRequired() },
                { _ -> initAdsIfAllowed() },
            )
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo consultar el consentimiento", t)
        }
        // Si ya hay consentimiento de una sesión anterior, se puede empezar sin esperar.
        initAdsIfAllowed()
    }

    /** Se llama desde MainActivity.onDestroy: corta los reintentos pendientes de esta pantalla. */
    fun destroy() {
        destroyed = true
        main.removeCallbacksAndMessages(null)
    }

    private fun showConsentFormIfRequired() {
        if (!alive) return
        try {
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { _ -> initAdsIfAllowed() }
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo mostrar el formulario de consentimiento", t)
            initAdsIfAllowed()
        }
    }

    private fun initAdsIfAllowed() {
        if (runCatching { consent.canRequestAds() }.getOrDefault(false)) initAds()
    }

    private fun initAds() {
        if (destroyed || !started.compareAndSet(false, true)) return
        val appContext = activity.applicationContext
        Thread {
            try {
                MobileAds.initialize(appContext) { _ ->
                    main.post {
                        loadRewarded()
                        loadInterstitial()
                    }
                }
            } catch (t: Throwable) {
                Log.w(TAG, "No se pudo iniciar AdMob", t)
            }
        }.start()
    }

    fun privacyOptionsRequired(): Boolean = runCatching {
        consent.privacyOptionsRequirementStatus == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
    }.getOrDefault(false)

    fun showPrivacyOptions() {
        main.post {
            if (!alive) return@post
            try {
                UserMessagingPlatform.showPrivacyOptionsForm(activity) { _ -> }
            } catch (t: Throwable) {
                Log.w(TAG, "No se pudieron mostrar las opciones de privacidad", t)
            }
        }
    }

    private fun loadRewarded() {
        if (rewarded != null || loadingRewarded || !started.get() || !alive) return
        loadingRewarded = true
        try {
            RewardedAd.load(activity, BuildConfig.ADMOB_REWARDED_ID, AdRequest.Builder().build(), object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    rewarded = ad
                    loadingRewarded = false
                    rewardedRetrySec = 0
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    loadingRewarded = false
                    retryRewarded()
                }
            })
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo pedir el recompensado", t)
            loadingRewarded = false
            retryRewarded()
        }
    }

    private fun retryRewarded() {
        if (destroyed) return
        rewardedRetrySec = (rewardedRetrySec * 2).coerceIn(15, 300)
        main.postDelayed({ loadRewarded() }, rewardedRetrySec * 1000)
    }

    private fun loadInterstitial() {
        if (interstitial != null || loadingInterstitial || !started.get() || !alive) return
        loadingInterstitial = true
        try {
            InterstitialAd.load(activity, BuildConfig.ADMOB_INTERSTITIAL_ID, AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitial = ad
                    loadingInterstitial = false
                    interstitialRetrySec = 0
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    loadingInterstitial = false
                    retryInterstitial()
                }
            })
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo pedir el intersticial", t)
            loadingInterstitial = false
            retryInterstitial()
        }
    }

    private fun retryInterstitial() {
        if (destroyed) return
        interstitialRetrySec = (interstitialRetrySec * 2).coerceIn(30, 600)
        main.postDelayed({ loadInterstitial() }, interstitialRetrySec * 1000)
    }

    /** Resultado a JS: 'earned' (vio el video completo), 'closed' (lo cerró antes) o 'unavailable'. */
    fun showRewarded(placement: String) {
        val p = placement.filter { it.isLetterOrDigit() }
        main.post {
            val ad = rewarded
            if (ad == null || !alive) {
                callJs("PuestoGame.onRewarded('$p','unavailable')")
                loadRewarded()
                return@post
            }
            rewarded = null
            var earned = false
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    callJs("PuestoGame.onRewarded('$p','${if (earned) "earned" else "closed"}')")
                    loadRewarded()
                }

                override fun onAdFailedToShowFullScreenContent(error: AdError) {
                    callJs("PuestoGame.onRewarded('$p','unavailable')")
                    loadRewarded()
                }
            }
            try {
                ad.show(activity) { _ -> earned = true }
            } catch (t: Throwable) {
                Log.w(TAG, "No se pudo mostrar el recompensado", t)
                callJs("PuestoGame.onRewarded('$p','unavailable')")
                loadRewarded()
            }
        }
    }

    /** Si no hay intersticial cargado, el juego sigue sin esperar. */
    fun showInterstitial() {
        main.post {
            val ad = interstitial
            if (ad == null || !alive) {
                callJs("PuestoGame.onInterstitialDone()")
                loadInterstitial()
                return@post
            }
            interstitial = null
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    callJs("PuestoGame.onInterstitialDone()")
                    loadInterstitial()
                }

                override fun onAdFailedToShowFullScreenContent(error: AdError) {
                    callJs("PuestoGame.onInterstitialDone()")
                    loadInterstitial()
                }
            }
            try {
                ad.show(activity)
            } catch (t: Throwable) {
                Log.w(TAG, "No se pudo mostrar el intersticial", t)
                callJs("PuestoGame.onInterstitialDone()")
                loadInterstitial()
            }
        }
    }
}
