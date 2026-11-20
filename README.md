# ECE 198 — exercise form check

The site is in `web/`.

- `index.html` is the home page: what the site does, the six exercises, and your training totals once you sign in.
- `features.html` lists the working features — workouts, accounts, and the live preview.
- `track.html` is the workout page: six arm exercises, live form scoring, and session saving.
- `account.html` is sign in / create account, plus your saved session history.

The site tracks exactly what the ESP32 measures: rep count and tempo for six arm exercises. It does not claim heart rate, steps, calories, distance, or sleep — there are no sensors for those.

## Accounts

Three ways accounts work, picked automatically:

- **Deployed on Vercel with KV:** accounts and sessions live server-side and sync across devices. Sign in anywhere and your history follows. Passwords are salted + hashed (scrypt) server-side, and session saves go through a per-user token.
- **Local (python http.server, file://):** accounts live in the browser's localStorage, salted + hashed (SHA-256).
- **Preset accounts** in `web/accounts.csv` — one `username,password` per line, usable in local mode. Edit the file and redeploy to share logins. The file is public, so use throwaway passwords.

While signed in, a session saves when you press **Save session**, switch exercises, or leave the page. Each saved session keeps the exercise, rep count, the good / too fast / too slow breakdown, and rep-by-rep history. The Account page shows totals and the full list, and the home page shows your all-time numbers.

Live at **https://ece198.vercel.app** with an Upstash Redis store attached, so accounts persist and sync across devices.

## Deploy (Vercel + KV)

The `web/api/` folder is three zero-dependency serverless functions (`auth`, `sessions`, plus a `_kv` helper) that talk to Vercel KV over its REST URL. One-time setup:

1. `npm i -g vercel` then `vercel login`
2. From this folder: `cd web` then `vercel` — accept the defaults. The `api/` functions deploy automatically.
3. Vercel dashboard → your project → **Storage** → **Create Database** → **KV** → connect it to the project. This injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. `vercel --prod` to redeploy with the database attached.

The free KV tier is plenty for a class demo. Vercel serves HTTPS, which is exactly what Web Bluetooth needs — the board connects from the deployed site the same way it does on localhost.

When the API isn't reachable (python server, KV not configured), the site silently uses local accounts + `accounts.csv` instead, so local dev keeps working with zero setup.

## Exercises

Flash `hardware.ino` for the multi-exercise firmware. It adds an exercise characteristic (`...26ab`): pick an exercise on the page and the board follows, or press the BOOT button on the board and the page follows.

1. Bicep curl — calibrated
2. Pec deck — needs calibration
3. Overhead extension — calibrated
4. Lateral raise — calibrated
5. Shoulder press — needs calibration
6. Tricep pushdown — calibrated

Uncalibrated exercises show a coral dot. Hold BOOT for 1.5 s (or press **Calibrate** on the page while connected) and follow the OLED: hold the start pose, then the end pose — about 12 seconds. Calibrations persist on the board.

- **Good form:** the rep reaches the end pose inside the tempo window (curl 3 s ±1, lateral raise 2.5 s ±1, the rest 3 s ±1).
- **Too fast / too slow:** full range, outside the window.

The older `bluetoothAndRepCounter.ino` is curl-only. The site still works with it — the exercise picker locks to Bicep curl.

The board advertises as `ESP32_BLE`.

## Open the site

Web Bluetooth only works on `localhost` or HTTPS, in Chrome or Edge.

```powershell
cd web
python -m http.server 8080
```

Then open http://localhost:8080.

**Preview** on the workout page plays sample reps for the selected exercise with no board attached, including the calibration flow for the two uncalibrated movements.
