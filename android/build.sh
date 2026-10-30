#!/usr/bin/env bash
# Baut die Reksio-App (Tests + APK) nach dist/reksio.apk.
# Werkzeuge: JDK 17 + Android-SDK (JAVA_HOME/ANDROID_HOME, Standard ~/opt/...).
# Heimnetz-Adressen in local.properties (siehe app/build.gradle.kts).
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-$HOME/opt/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/opt/android-sdk}"
PATH="$JAVA_HOME/bin:$PATH" ./gradlew --no-daemon -q testReleaseUnitTest assembleRelease
mkdir -p dist
cp app/build/outputs/apk/release/app-release.apk dist/reksio.apk
echo "Fertig: $PWD/dist/reksio.apk"
