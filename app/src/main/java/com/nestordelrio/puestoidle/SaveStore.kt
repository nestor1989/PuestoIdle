package com.nestordelrio.puestoidle

import android.content.Context

/** Guardado local del juego y dos banderas nativas. Todo en SharedPreferences. */
class SaveStore(context: Context) {

    private val prefs = context.getSharedPreferences("puesto", Context.MODE_PRIVATE)

    fun load(): String? = prefs.getString("save", null)

    /** [remind] = el jugador tiene ayudantes y aceptó el aviso de "puesto lleno". */
    fun save(json: String, remind: Boolean) {
        prefs.edit().putString("save", json).putBoolean("remind", remind).apply()
    }

    val shouldRemind: Boolean get() = prefs.getBoolean("remind", false)

    var noAds: Boolean
        get() = prefs.getBoolean("no_ads", false)
        set(value) {
            prefs.edit().putBoolean("no_ads", value).apply()
        }
}
