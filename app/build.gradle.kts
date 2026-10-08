import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
}

// IDs de prueba oficiales de Google para AdMob: los usa siempre el build de debug.
val testAppId = "ca-app-pub-3940256099942544~3347511713"
val testRewardedId = "ca-app-pub-3940256099942544/5224354917"
val testInterstitialId = "ca-app-pub-3940256099942544/1033173712"

// IDs reales para release: ~/.gradle/gradle.properties o gradle.properties del proyecto.
fun prop(name: String): String? = (project.findProperty(name) as String?)?.trim()?.takeIf { it.isNotEmpty() }
val admobKeys = listOf("ADMOB_APP_ID", "ADMOB_REWARDED_ID", "ADMOB_INTERSTITIAL_ID")
val missingAdmob: List<String> = admobKeys.filter { prop(it) == null }

android {
    namespace = "com.nestordelrio.puestoidle"
    compileSdk = 36

    defaultConfig {
        // El applicationId es permanente una vez subido a Play. Cambialo antes de la primera subida si hace falta.
        applicationId = "com.nestordelrio.puestoidle"
        minSdk = 24          // mínimo de Google Mobile Ads 25.5.0
        targetSdk = 36       // exigido por Play para apps nuevas desde el 31/08/2026
        // Subir versionCode en cada AAB que vaya a Play (Play rechaza un número ya usado).
        versionCode = 2
        versionName = "1.0.1"
    }

    buildTypes {
        debug {
            manifestPlaceholders["admobAppId"] = testAppId
            buildConfigField("String", "ADMOB_REWARDED_ID", "\"$testRewardedId\"")
            buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"$testInterstitialId\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            manifestPlaceholders["admobAppId"] = prop("ADMOB_APP_ID") ?: testAppId
            buildConfigField("String", "ADMOB_REWARDED_ID", "\"${prop("ADMOB_REWARDED_ID") ?: testRewardedId}\"")
            buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"${prop("ADMOB_INTERSTITIAL_ID") ?: testInterstitialId}\"")
        }
        // Igual al release (pasa por R8, sin herramientas de prueba), pero firmado con la clave de debug,
        // con los anuncios de prueba y con otro applicationId para convivir con la versión de Play.
        // Se instala con Run: es la forma de ver en tu teléfono las fallas que solo tiene el release.
        create("staging") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            manifestPlaceholders["admobAppId"] = testAppId
            buildConfigField("String", "ADMOB_REWARDED_ID", "\"$testRewardedId\"")
            buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"$testInterstitialId\"")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // Versiones estables de 2025, elegidas por compatibilidad con el Kotlin 2.2 que trae AGP 9.1.
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    // play-services-ads arrastra androidx.fragment 1.1.0 y el lint de release (fatal) exige 1.3.0 o más
    // para usar registerForActivityResult. Se fija una versión estable de 2025.
    implementation("androidx.fragment:fragment:1.8.9")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    // Anuncios (SDK "legacy", 25.5.0 del 17/09/2026) + formulario de consentimiento UMP 4.0.0.
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:4.0.0")
    // Play Billing 9.1.0 (18/06/2026). Play exige 8.0+ desde el 31/08/2026.
    implementation("com.android.billingclient:billing:9.1.0")
}

// Freno de seguridad: un release nunca se arma con los IDs de prueba de AdMob.
val checkAdmobIds by tasks.registering {
    doLast {
        if (missingAdmob.isNotEmpty()) {
            throw GradleException("Faltan IDs reales de AdMob para release: ${missingAdmob.joinToString()}. Ver LEEME.md, paso 4.")
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(checkAdmobIds) }
