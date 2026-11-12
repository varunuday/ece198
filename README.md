# ECE 198 — exercise form check

The site is in `web/`.

- `index.html` is the fitness board: watch rings and the day's stats.
- `features.html` is the dropdown list of stats. Copy a block there to add another one.
- `track.html` is the curl-form workout, the first live session.

ESP32 firmware reads an analog accelerometer, counts bicep curls, and scores each one.

- **Good form:** the arm reaches the top and the curl takes 2 to 4 seconds.
- **Too fast:** full range, under 2 seconds.
- **Too slow:** full range, over 4 seconds.

The board advertises as `ESP32_BLE`.

## Open the site

Web Bluetooth only works on `localhost` or HTTPS, in Chrome or Edge.

```powershell
cd web
python -m http.server 8080
```

Then open http://localhost:8080.

Reflash `bluetoothAndRepCounter.ino` so the tracker can follow the arm live. Rep count and the good / too fast / too slow verdict still work on the previous firmware.

**Preview** on the tracker plays sample curls with no board attached.

Distance (HC-SR04) is not on this firmware yet. The site leaves a place for it.
