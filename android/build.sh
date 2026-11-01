#!/usr/bin/env bash
# Baut die Reksio-App (Web-App, Tests, APK) nach dist/reksio.apk.
# Werkzeuge: Node 22, JDK 17 + Android-SDK (JAVA_HOME/ANDROID_HOME, Standard ~/opt/...).
# Heimnetz-Adressen in local.properties (siehe app/build.gradle.kts).
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-$HOME/opt/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/opt/android-sdk}"
# Signierschlüssel nur lokal: beim ersten Bau erzeugen, Passwort landet in local.properties
if [ ! -f reksio.keystore ]; then
    pw=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
    "$JAVA_HOME/bin/keytool" -genkeypair -keystore reksio.keystore -storetype PKCS12 -storepass "$pw" \
        -alias reksio -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Reksio" >/dev/null
    chmod 600 reksio.keystore
    sed -i '/^reksio\.keystore/d' local.properties 2>/dev/null || true
    printf 'reksio.keystore=reksio.keystore\nreksio.keystorePassword=%s\n' "$pw" >> local.properties
    chmod 600 local.properties
fi
# die Oberfläche steckt in der APK (Oberflaeche.kt)
(cd ../web && npm ci --silent && VITE_REKSIO_VERSION="${REKSIO_VERSIONNAME:-}" npm run build >/dev/null)
PATH="$JAVA_HOME/bin:$PATH" ./gradlew --no-daemon -q testReleaseUnitTest assembleRelease
mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk dist/reksio.apk
echo "Fertig: $PWD/dist/reksio.apk"
