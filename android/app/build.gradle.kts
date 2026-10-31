import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Die Serveradresse stellt man in der App ein (Suche im Netz oder Eingabe). Optional vorbelegt über
// android/local.properties (gitignored):
//   reksio.vacuulaUrl=http://<SERVER-IP>:8050
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
        versionCode = einstellung("versionCode", "2").toInt()
        versionName = einstellung("versionName", "0.2.0")
        buildConfigField("String", "VACUULA_URL", "\"${einstellung("vacuulaUrl", "")}\"")
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
