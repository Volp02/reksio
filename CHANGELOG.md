# Changelog

## Unreleased

- **Several robots**: the robot name at the top left (on phones in the top bar) switches between robots; the choice is kept per device.
- **Gen4 robots (D8, D9, D10)**: start, pause, stop, dock, status and battery; cleaning history with the driven path; maps from any cleaning run (Map → Maps → Add), zones and no-go lines are stored on the server and sent to the robot together with the map that is in use; several zones in one go (the robot cleans them in order itself); server schedule for whole map or zones. ESP telemetry stays Gen3-only.
- **Gen4 no-go areas**: besides no-go lines, areas the robot leaves out (Map → Edit → No-go area, or switch a zone's type).
- **Gen4 notifications**: the server turns the robot's own events into notices (started, paused, charging and resuming, returning, finished, errors, offline during a run); the Android app shows them with the robot's name. Error and alert codes have readable texts in the web app.
- **Gen4 settings**: clean with map only, robot language (Settings → Robot).
- **Background tabs**: live event streams close 30 s after a tab is hidden and reopen with fresh data when it is shown again (browsers allow only six HTTP/1.1 connections per host, so three open tabs blocked every further request).
- **History updates by itself**: a finished cleaning, and returning to a hidden tab, refresh the run list in the overview and the history without reloading the page.
- **Android notification without ESP**: the permanent notification showed "Nicht erreichbar" whenever no ESP telemetry came in (always for Gen4, and for Gen3 while the ESP is off). It now lists the connected robots from the server with their last state (e.g. "D9: Unterwegs"); "Nicht erreichbar" only when no robot is connected.

## 0.2.0

First release with a ready-made server image, Android app and ESP firmware.

- **Server-side schedule**: whole map or several zones in a fixed order, weekdays and time; waits up to 60 min for the robot to be ready; single dates can be skipped.
- **Zone sequences**: detects zones that were not cleaned (e.g. "position not found") and retries them once.
- **History**: schedule and zone runs grouped, result per zone, incidents with time, driven path on the map (toggleable), older runs back-filled from the ESP history.
- **Zones**: backup on every save with restore, "last cleaned" per zone; saving merges the robot's current state (no more overwrites after restarts).
- **Run report from the robot** in the history: picked up, position lost, time in error and pause, charging stops (summed up for zone sequences).
- **Snapping while drawing**: corners always sit on the map grid (between the dots) and align to the edges of other zones (dotted guide line); hold Alt to place freely.
- **App download in the web app**: Settings → Android app; a one-time, dismissible hint in the Android browser. The APK comes from the GitHub release matching the server version; if a `reksio-<version>.apk` is placed in `data/app`, the server serves that one instead (for networks without internet).
- **Start** cleans the whole map, so no-go lines apply.
- **Data stays on the server**: paths are kept permanently, telemetry is thinned to one value per minute after 30 days.
- **Android app 0.2.0**: server address set in the app (with network search), notifications come from the server instead of the ESP. The UI is bundled in the app and only data comes from the server: it starts without a server ("Offline" with "Retry" and "App server address") and shows "App update" when the server runs a newer version.
- **Access**: optional password (Settings → Access); every /api request then needs a login (cookie, or `Authorization: Bearer <token>` from `POST /api/auth/login`). The robot's endpoints are not affected.
- **Map follows dragging during a run**: dragging quickly while Reksio was moving froze the map until release (the glide animation cancelled every redraw). Zoomed in, the map is now drawn in tiles that appear progressively (at most 6 ms per frame).
- **Live LIDAR (experimental)**: a button on the live map (overview and map, only while Reksio is running) shows the current LIDAR scan as dots around Reksio. The ESP only reads scans while someone is watching (a request lasts 15 s, the app renews it every 5 s while the page is visible); nothing is stored, and the button is off after every reload. While it is on, the map shows "Experimental".
- **Dust bin runtime in minutes**: the robot reports it in milliseconds, and the maintenance card showed the raw number (e.g. "3,342,470 of 90 min" instead of 55 min).
- **More telemetry from the ESP**: vacuum and side brush current, wall and floor sensors (mm), tilt and turn rate, LIDAR speed. The server reads the raw serial responses and parses them itself; the ESP firmware now also recognises the D7's `Vacuum_mA` and `ROTATION_SPEED`.
- **Faster map**: map dots are rasterised straight into pixels instead of a path with tens of thousands of circles (switching to the map took several seconds without a GPU, "app isn't responding"). Maps, zones and history are kept on the device and appear instantly; fresh data follows.
- **Map controls** no longer draw over the navigation bar.
- **Phones**: on the map, power, navigation and the clean button sit above the zone list; in the schedule, "Skip" moves below the event so days and zones stay readable.
- **No more CORS**: other websites can no longer control the server through the browser (set `CORS_ORIGIN` if needed).
