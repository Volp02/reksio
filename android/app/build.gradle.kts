import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Adressen im Heimnetz stehen nicht im (öffentlichen) Repo, sondern in
// android/local.properties (gitignored):
//   reksio.vacuulaUrl=http://<SERVER-IP>:8050
//   reksio.espHost=<ESP-IP>
val lokal = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun einstellung(name: String, standard: String) =
    (lokal.getProperty("reksio.$name") ?: System.getenv("REKSIO_${name.uppercase()}") ?: standard)

android {
    namespace = "io.github.volp02.reksio"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.volp02.reksio"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "VACUULA_URL", "\"${einstellung("vacuulaUrl", "http://vacuula.local:8050")}\"")
        buildConfigField("String", "ESP_HOST", "\"${einstellung("espHost", "neato.local")}\"")
    }

    // Signierschlüssel liegt nur lokal (gitignored), Pfad und Passwort in local.properties:
    //   reksio.keystore=reksio.keystore
    //   reksio.keystorePassword=<geheim>
    // build.sh legt beides beim ersten Bau an. Gleicher Schlüssel = APK lässt sich
    // über die installierte legen; neuer Schlüssel = App einmal deinstallieren.
    signingConfigs {
        create("reksio") {
            storeFile = rootProject.file(einstellung("keystore", "reksio.keystore"))
            storePassword = einstellung("keystorePassword", "")
            keyAlias = "reksio"
            keyPassword = einstellung("keystorePassword", "")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("reksio")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
