# Puesto Idle — proyecto Android

Juego idle de un puesto de comida callejera. Es una app nativa con un WebView que carga el juego desde los assets. Funciona sin internet; la red solo se usa para los anuncios y la compra.

**Importante:** este proyecto se escribió sin poder compilarlo. El entorno donde se preparó no tiene el SDK de Android ni acceso a los repositorios de Google. El primer build en Android Studio es la verificación real. Si falla, pegá el error completo en el chat y lo corrijo.

- Paquete: `com.nestordelrio.puestoidle`. Es permanente una vez subido a Play; cambialo antes de la primera subida si hace falta (`app/build.gradle.kts`, `applicationId`).
- Idiomas del juego: español (neutro), inglés, portugués, francés, alemán e italiano, según el idioma del teléfono.

## 1. Abrir y compilar

1. Android Studio reciente, con soporte para AGP 9.1 (Gradle 9.3.1, JDK 17 o más nuevo).
2. File > Open > esta carpeta. Dejá que sincronice Gradle.
3. Elegí la variante `debug` y ejecutá en un teléfono con Android 7.0 o más nuevo. Antes de subir a Play, probá también la variante `staging` (ver sección 4).

El build de debug usa siempre los anuncios de prueba de Google y muestra en el menú ☰ las herramientas de prueba: datos del playtest, velocidad ×10, simular 1 h afuera, forzar intersticial y borrar progreso.

### Si Gradle falla

- **"Unresolved reference: kotlin" o algo sobre `compilerOptions`** en `app/build.gradle.kts`: borrá el bloque `kotlin { ... }` y la línea `import` de arriba. AGP 9 ya alinea la versión de Java por su cuenta.
- **Tu Android Studio no acepta AGP 9.1.1**: actualizá Android Studio, o avisame qué versión tenés y adapto el proyecto.
- **Cualquier otro error**: pegalo completo en el chat.

## 2. Qué probar en el teléfono (fase 4)

- [ ] Al abrir no aparece ningún anuncio. Solo puede aparecer el formulario de consentimiento, y únicamente en Europa o el Reino Unido.
- [ ] Sin que nadie te explique nada, se entiende que hay que tocar los churros. Menú ☰ > Datos del playtest > "Primer toque" muestra el tiempo.
- [ ] Comprar, contratar a Rosa y abrir empanadas funciona. Cada toque vibra, si el teléfono tiene activada la vibración al tocar.
- [ ] El botón ▶ ×2 ventas muestra un video de prueba de AdMob. Al terminarlo, se activa la hora pico.
- [ ] Cerrar el juego con un ayudante contratado, esperar 2 minutos y volver: aparece "¡Volviste!". "Cobrar ×2" muestra un video y duplica. Si cerrás el video antes de que termine, igual cobra lo normal.
- [ ] Menú ☰ > Forzar intersticial: se ve un intersticial de prueba. En el juego real, solo aparece al mudarse de barrio, desde la 4.ª sesión y como máximo 1 cada 30 minutos.
- [ ] El botón atrás cierra carteles, después vuelve a la pestaña Cocina y después sale del juego.
- [ ] Al matar la app y volver a abrirla, el progreso sigue ahí.
- [ ] Durante un video "▶ ×2 ventas", salir con el botón de inicio y volver desde el ícono: el video sigue ahí.
- [ ] Aviso de puesto lleno:
  - En la 2.ª sesión con ayudantes, el juego pregunta si querés el aviso. Aceptá y dale permiso.
  - Cerrá el juego. En debug, el aviso llega a los 2 minutos; en la versión publicada, a las 8 horas.
- [ ] "Quitar anuncios" (en ☰) abre la compra de Play. Solo funciona después del paso 5.

## 3. AdMob (ya configurado)

La app y los 2 bloques ya están creados en AdMob, y sus IDs están en `gradle.properties`:

| Qué | ID | Lo usa |
| --- | --- | --- |
| App | `ca-app-pub-4930505659937183~4808547427` | Manifiesto (release) |
| Recompensado `PuestoIdle_Recompensado_x2` | `ca-app-pub-4930505659937183/6556743361` | "▶ ×2 ventas" y "Cobrar ×2" |
| Intersticial `PuestoIdle_Intersticial_Mudanza` | `ca-app-pub-4930505659937183/8743923006` | Al mudarse de barrio |

- **Debug** sigue usando los IDs de prueba de Google, a propósito: tocar tus propios anuncios reales puede hacer que AdMob suspenda la cuenta por tráfico inválido.
- **Release** usa los IDs reales. Si alguno de los 3 llegara a faltar en `gradle.properties`, el build de release se frena con un mensaje.
- Si querés probar los anuncios reales en tu teléfono sin riesgo, agregalo como dispositivo de prueba en AdMob > Configuración > Dispositivos de prueba.

Pendiente en AdMob:

1. **Mensaje de consentimiento**: en Privacidad y mensajes, creá el mensaje del RGPD (Europa y Reino Unido). El juego ya lo muestra con el SDK de consentimiento de Google (UMP). Cuando hace falta, el menú ☰ muestra además "Opciones de privacidad". Sin ese mensaje, en Europa no se piden anuncios.
2. **Vincular a Play**: después del lanzamiento, en la configuración de la app, vinculá la app con su ficha de Google Play.
3. **app-ads.txt**: publicá `docs/app-ads.txt` en la raíz del sitio web que declares como sitio del desarrollador en Play Console. Debe quedar en `https://tu-sitio/app-ads.txt`. AdMob lo usa para verificar que el inventario es tuyo; sin él puede limitar los anuncios.

## 4. Firmar y generar el AAB

1. Build > Generate Signed App Bundle > release. Creá una clave de subida y guardala fuera del proyecto, con copia de seguridad.
2. En Play Console, dejá activado el firmado de apps de Play (Play App Signing).
3. Cada AAB que subas necesita un `versionCode` más alto que el anterior (`app/build.gradle.kts`). Ahora va por el 2 (versión 1.0.1).

### Probar el release antes de mandarlo a revisión

El build de debug no pasa por R8, así que no alcanza para saber si el release anda. La versión 1 se cerraba al abrir solo en release: R8 había borrado una pieza que WorkManager necesita al arrancar.

1. **En tu teléfono, con la variante `staging`**: en Build Variants elegí `staging` y tocá Run. Es igual al release (pasa por R8 y no muestra las herramientas de prueba), pero usa los anuncios de prueba y se instala aparte, como "Puesto Idle" con el id `com.nestordelrio.puestoidle.staging`. Abrila, cerrala y volvé a abrirla. Jugá unos minutos y mirá un "▶ ×2 ventas". Si se cierra, el error completo aparece en Logcat de Android Studio (buscá `FATAL EXCEPTION`).
2. **Desde Play**: subí el AAB a **Prueba interna** e instalalo desde el enlace de la prueba. Antes, agregá tu teléfono como dispositivo de prueba en AdMob (ver sección 3) para no generar tráfico inválido con los anuncios reales.
3. Revisá el **informe previo al lanzamiento** de Play Console (buscalo con la barra de búsqueda de la Console). Play lo arma solo, probando el AAB en varios teléfonos, y lista las fallas que encuentra.

### Si Play informa fallas

- El detalle de cada falla está en Play Console > Calidad > Android vitals > Fallas y ANR, y en el informe previo al lanzamiento.
- El AAB incluye el mapa de R8, así que Play muestra el stack trace con los nombres reales de las clases.
- Pegá el stack trace completo en el chat y lo corrijo.

## 5. Play Console

1. **Crear app**: nombre "Puesto Idle", juego, gratis, con anuncios.
2. **Prueba interna**: subí el AAB. Play exige subir una versión antes de dejarte crear productos.
3. **Producto integrado**: Monetizar > Productos > Productos únicos.
   - ID `no_ads`. Tiene que ser exacto, porque es el que usa `BillingManager.kt`.
   - Nombre "Quitar anuncios". Precio de prueba US$ 2,99, con precios locales automáticos.
4. **Pruebas de licencia**: Configuración > Pruebas de licencia. Agregá tu cuenta para comprar sin cobro real.
5. **Ficha de la tienda**: todo junto, listo para copiar y pegar, está en `FICHA-PLAY-STORE.md` (en la raíz del proyecto). Los mismos textos están separados por archivo en `fastlane/metadata/android/<idioma>/`:
   - `title.txt`: nombre de la app (máximo 30 caracteres).
   - `short_description.txt`: descripción breve (máximo 80).
   - `full_description.txt`: descripción completa (máximo 4.000).

   Idiomas: en-US, es-419, es-ES, pt-BR, fr-FR, de-DE, it-IT. Los gráficos están en `store-graphics/`:
   - `icon-512.png`: ícono de la ficha.
   - `feature-graphic-1024x500.png`: gráfico destacado, el mismo para todos los idiomas.
   - `screenshots/<idioma>/1.png` a `4.png`: capturas de teléfono de 1080×1920, cada una con su frase en el idioma. Se suben en ese orden.
6. **Categoría y etiquetas**:
   - Categoría: Juegos > Simulación.
   - Etiquetas: Business & tycoon, Incremental, Restaurant & cooking, Simulation y Casual. Si la Console está en español, aparecen traducidas.
7. **Contenido de la app**:
   - **Política de privacidad**: hay un borrador en `docs/politica-de-privacidad.html`. Completá tu email de contacto y publicala en una URL pública.
   - **Anuncios**: sí, la app contiene anuncios.
   - **ID de publicidad**: sí, se usa para publicidad (lo usa el SDK de AdMob).
   - **Acceso a la app**: todo disponible sin restricciones.
   - **Público objetivo**: de 13 a 15, de 16 a 17 y 18 o más. No incluir menores de 13; si se incluyen, aplican las reglas del programa de Familias.
   - **Clasificación de contenido**: sin violencia, sexo, lenguaje fuerte ni apuestas. Tiene compras y anuncios.
   - **Seguridad de los datos**: ver la sección 6.

## 6. Seguridad de los datos (borrador)

Estas respuestas describen lo que hace este código. Confirmalas con la guía de divulgación de datos de AdMob antes de enviarlas: el SDK puede cambiar.

- El juego no tiene cuentas ni servidor propio. El progreso queda en el teléfono y entra en la copia de seguridad de Android.
- **Recopilan datos, a través del SDK de AdMob**:
  - Ubicación aproximada (derivada de la IP).
  - Identificadores del dispositivo (ID de publicidad).
  - Actividad en la app (interacciones con anuncios).
  - Información y rendimiento de la app (diagnósticos y fallas).
- **Se comparten** con Google para publicidad.
- **Finalidades**: publicidad, estadísticas, y prevención de fraude y seguridad.
- **Cifrado en tránsito**: sí.
- **Compras**: las procesa Google Play. El juego no ve ni guarda datos de pago.

## 7. Monetización (qué hace el código)

| Formato | Dónde | Límite |
| --- | --- | --- |
| Recompensado | "▶ ×2 ventas 4 min" (botón arriba) | Se acumula hasta 60 min |
| Recompensado | "Cobrar ×2" al volver al juego | 1 por regreso; si el video no termina, cobra lo normal |
| Intersticial | Al confirmar una mudanza de barrio, antes del barrio nuevo | Nunca en las 3 primeras sesiones; máximo 1 cada 30 min |
| Pago único | "Quitar anuncios" (`no_ads`) | Saca el intersticial y da las recompensas sin video |

No hay anuncios al abrir, ni banners, ni suscripciones.

## 8. Versiones usadas

Investigadas en las fuentes oficiales el 29/09/2026. No fueron compiladas.

| Pieza | Versión | Motivo |
| --- | --- | --- |
| targetSdk / compileSdk | 36 | Play lo exige para apps nuevas desde el 31/08/2026 |
| Android Gradle Plugin | 9.1.1 (abril 2026) | Estable, soporta API 36; Gradle 9.3.1 |
| Google Mobile Ads | 25.5.0 (17/09/2026) | minSdk 24 |
| Consentimiento UMP | 4.0.0 | La que acompaña a Ads 25.x |
| Play Billing | 9.1.0 (18/06/2026) | Play exige 8.0 o más desde el 31/08/2026 |
| androidx core / activity / webkit / work | 1.16.0 / 1.10.1 / 1.14.0 / 2.10.0 | Estables de 2025, compatibles con el Kotlin 2.2 de AGP 9.1 |
| androidx fragment | 1.8.9 (agosto 2025) | play-services-ads trae la 1.1.0, y el lint de release exige 1.3.0 o más para pedir permisos |

## Estructura

```
app/src/main/assets/www/   el juego: index.html, game.js, i18n.js (textos), fonts/ (OFL)
app/src/main/java/.../     MainActivity (WebView), GameBridge (JS ↔ Android), AdsManager,
                           BillingManager, SaveStore (guardado), Reminders (aviso de puesto lleno)
app/src/main/res/          íconos, textos de la notificación en 6 idiomas, tema
FICHA-PLAY-STORE.md        ficha de Play completa (datos, gráficos y textos de los 7 idiomas)
fastlane/metadata/android/ fichas de Play por idioma, un archivo por campo
store-graphics/            ícono 512, gráfico destacado, capturas
docs/                      política de privacidad (borrador) y app-ads.txt
```

Para probar el juego en una computadora sin Android, serví la carpeta `app/src/main/assets/www` con cualquier servidor local (por ejemplo `python3 -m http.server`) y abrí `index.html`. Sin el puente nativo, los anuncios y la compra se simulan.
