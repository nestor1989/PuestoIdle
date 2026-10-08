package com.nestordelrio.puestoidle

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Un solo aviso, a las 8 h de cerrar el juego (el tope de ventas sin jugar).
 * Se programa al salir y se cancela al volver. Nada de avisos diarios ni repetidos.
 */
object Reminders {
    private const val WORK_NAME = "puesto_lleno"
    const val CHANNEL_ID = "puesto_lleno"
    // En debug el aviso llega a los 2 minutos, para poder probarlo sin esperar 8 horas.
    private val delayMinutes: Long get() = if (BuildConfig.DEBUG) 2L else 8L * 60L

    // WorkManager guarda sus tareas en una base SQLite: si falla en algún teléfono (disco lleno, base dañada),
    // se pierde el aviso, no el juego.
    fun schedule(context: Context) {
        try {
            val request = OneTimeWorkRequestBuilder<FullStandWorker>()
                .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
        } catch (t: Throwable) {
            Log.w("PuestoAviso", "No se pudo programar el aviso", t)
        }
    }

    fun cancel(context: Context) {
        try {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        } catch (t: Throwable) {
            Log.w("PuestoAviso", "No se pudo cancelar el aviso", t)
        }
    }
}

class FullStandWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    @SuppressLint("MissingPermission") // se verifica justo abajo
    override fun doWork(): Result {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return Result.success()

        val manager = NotificationManagerCompat.from(ctx)
        if (!manager.areNotificationsEnabled()) return Result.success()

        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(Reminders.CHANNEL_ID, ctx.getString(R.string.notif_channel), NotificationManager.IMPORTANCE_DEFAULT)
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val intent = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

        val notification = NotificationCompat.Builder(ctx, Reminders.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_puesto)
            .setContentTitle(ctx.getString(R.string.notif_title))
            .setContentText(ctx.getString(R.string.notif_text))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()

        runCatching { manager.notify(1, notification) }
        return Result.success()
    }
}
