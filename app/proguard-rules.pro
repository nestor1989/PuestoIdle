# El juego llama a estos métodos desde JavaScript: R8 no debe renombrarlos ni borrarlos.
-keepclassmembers class com.nestordelrio.puestoidle.GameBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# WorkManager guarda sus tareas con Room, y Room crea la base por reflexión usando el constructor
# vacío de WorkDatabase_Impl. La regla que trae Room 2.6.1 (-keep class * extends RoomDatabase)
# conserva la clase pero no ese constructor: R8 en modo completo no lo conserva solo, lo borró,
# y el release se cerraba al abrir ("Failed to create an instance of androidx.work.impl.WorkDatabase").
# Fue la falla del versionCode 1 que rechazó Play (04/10/2026).
-keep class * extends androidx.room.RoomDatabase {
    <init>();
}
