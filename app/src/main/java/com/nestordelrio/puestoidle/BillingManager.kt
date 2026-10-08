package com.nestordelrio.puestoidle

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams

/**
 * Compra única "Sin anuncios" con Play Billing 9.1.
 * Producto en Play Console: tipo "producto único" (in-app), ID [NO_ADS], no consumible (se reconoce, no se consume).
 * Un error de Play Billing nunca cierra el juego: la compra simplemente queda no disponible.
 */
class BillingManager(
    context: Context,
    private val store: SaveStore,
    private val callJs: (String) -> Unit,
) : PurchasesUpdatedListener {

    companion object {
        const val NO_ADS = "no_ads"
        private const val TAG = "PuestoBilling"
    }

    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    @Volatile
    private var details: ProductDetails? = null

    val owned: Boolean get() = store.noAds

    fun start() {
        try {
            client.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                        queryDetails()
                        refreshOwned()
                    }
                }

                override fun onBillingServiceDisconnected() {
                    // enableAutoServiceReconnection() reintenta solo en la próxima llamada.
                }
            })
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo conectar con Play Billing", t)
        }
    }

    fun end() {
        runCatching { client.endConnection() }
    }

    private fun queryDetails() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(NO_ADS)
            .setProductType(BillingClient.ProductType.INAPP)
            .build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        try {
            client.queryProductDetailsAsync(params) { result, productDetailsResult ->
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    details = productDetailsResult.productDetailsList.firstOrNull()
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo consultar el producto", t)
        }
    }

    /** Precio con formato local de Play (por ejemplo "US$ 2,99"), o vacío si todavía no llegó. */
    fun price(): String = runCatching {
        details?.oneTimePurchaseOfferDetailsList?.firstOrNull()?.formattedPrice
    }.getOrNull() ?: ""

    /** Abre la hoja de compra de Play. Devuelve false si el producto todavía no está disponible. */
    fun launch(activity: Activity): Boolean {
        val productDetails = details ?: return false
        return try {
            val paramsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(productDetails)
            productDetails.oneTimePurchaseOfferDetailsList?.firstOrNull()?.offerToken?.let { paramsBuilder.setOfferToken(it) }
            val flowParams = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(paramsBuilder.build())).build()
            client.launchBillingFlow(activity, flowParams).responseCode == BillingClient.BillingResponseCode.OK
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudo abrir la compra", t)
            false
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases?.forEach { handle(it, notify = true) }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                store.noAds = true
                callJs("PuestoGame.onPurchase(true)")
            }
            else -> callJs("PuestoGame.onPurchase(false)")
        }
    }

    private fun handle(purchase: Purchase, notify: Boolean) {
        if (!purchase.products.contains(NO_ADS)) return
        // Una compra PENDING (pago en efectivo, etc.) todavía no desbloquea nada.
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) return
        store.noAds = true
        if (notify) callJs("PuestoGame.onPurchase(true)")
        if (!purchase.isAcknowledged) {
            val ack = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()
            runCatching { client.acknowledgePurchase(ack) { _ -> } }
        }
    }

    /** Restaura la compra al abrir (reinstalación, otro teléfono) y la quita si fue reembolsada. */
    private fun refreshOwned() {
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build()
        try {
            client.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) return@queryPurchasesAsync
                store.noAds = purchases.any { it.products.contains(NO_ADS) && it.purchaseState == Purchase.PurchaseState.PURCHASED }
                purchases.forEach { handle(it, notify = false) }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "No se pudieron consultar las compras", t)
        }
    }
}
