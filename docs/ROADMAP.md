# Roadmap

## Before the first release (v0.2.0)

The release (tag `v0.2.0`) only happens once everything here has been tested on the real robot and phone.

- [ ] **Start button**: cleans the whole map (map category) and respects no-go lines such as "Cables"
- [ ] **Zone sequence with an error**: one zone fails (e.g. path blocked) → second attempt → "not cleaned" in the history and as a notification
- [ ] **Schedule**: a "Whole map" event really starts (map category); "Skip today" on a real event
- [ ] **History**: a new schedule/zone run appears grouped, path and incidents are correct
- [ ] **App 0.2.0**: install over the old app, server search, notifications (errors, zones, skipped event), watcher after a phone reboot; UI bundled in the app (starts without a server, "App update" with a newer server, download link from the release)
- [ ] **Access**: set a password, log in from app and web, watcher with login, remove the password again
- [x] **Release workflow**: dry run with a pre-release tag (`v0.2.0-rc2`): image, APK, firmware and APK attestation in the release

## Next

- **Android app in English**: server setup screen and notifications are German only (the web UI already has both)
- **Onboarding**: guided setup on first start (server, connect the robot, optional ESP, explore the map, create zones), in the web app and the Android app
- **Guide**: step by step from "Neato without cloud" to a finished setup, with troubleshooting
- **Zone count**: "1 zones" in the history

## Later

- **App offline with the last state**: cache telemetry too and show it as stale without a server (DESIGN.md §12.3) instead of just "Offline"
- **Home Assistant**: Reksio as a vacuum entity (state, battery, start/stop/dock, zones as buttons)
- **Maintenance**: filter, brushes and battery with counters and a "replaced" button, reminders
- **Backup**: export/import the database in the app
- **Upstream**: changes to Vacuula and OpenNeato as pull requests (via `git subtree split`)
- **Emulator tests of the app**: needs ffmpeg with libx264 on the Docker host
