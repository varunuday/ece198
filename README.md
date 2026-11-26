# ExerBox: Wearable Exercise Rep Counter & Form Tracker
By Varun Udayachandiran, Siddharth Khunti, Utkarsh Chandrabhushan Singh, Ayush Kothari

## Overview

We built a wrist watch with a live display that shows the number of completed reps and feedback on the user's form. This data is linked to a [website](https://ece198.vercel.app) via Bluetooth Low Energy (BLE), which stores the user's workout history.

The project was designed for elderly patients enrolled in the University of Waterloo's Centre for Community, Clinical and Applied Research Excellence (CCCARE) who are working out under limited or no supervision. This device could allow CCCARE to provide more support to patients in large class sizes and expand their services to patients at home.

![ExerBox](images/ExerBox.HEIC)
![ExerBox with Website](<images/ExerBox with Website.HEIC>)
[Youtube Demo Video](https://youtu.be/eJpfpgINAaE?si=ym_6DFrw67wo9XDW)

## System Logic

![System Logic](<images/System Logic.png>)

## Hardware

Parts List:
- ESP32 microcontroller
- MMA7361 3-axis accelerometer
- SSD1306 OLED display
- Jumper wires
- Wrist strap, velcro, cardboard, tape (wrist band and box)

![Circuit Diagram](<images/Circuit diagram.png>)

## Firmware

The firmware flashed to the ESP32 is in `hardware.ino`. The file `bicepCurl.ino` was the first draft of the firmware, which only worked for one exercise.

- An Exponential Moving Average (EMA) filter smooths the accelerometer data
- Each exercise uses data from only one axis. Pre-calibrated starting and ending values for each exercise allow readings to be converted into a %progress from 0-100.
- A movement must start from below 30%, pass 70%, and return to below 30% to count as one rep.
- Each movement has an ideal tempo range -- if it's below the range, the screen reads "TOO FAST" and if it's above the range, it reads "TOO SLOW"
- Reps under 1 second long are ignored to filter out jolts or sudden movements.
- Rep count and form feedback are displayed on the OLED, communicated via I2C protocol.
  
## Website

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

Flash `hardware.ino` for the multi-exercise firmware. It adds an exercise characteristic (`...26ab`): pick an exercise on the page and the board follows.

1. Bicep curl — calibrated (axis Z, arm vertical down to vertical up)
2. Pec deck — calibrated (axis Y, arms wide open to chest squeeze)
3. Overhead extension — calibrated (axis X, behind head to overhead)
4. Lateral raise — calibrated (axis X, arm hanging to horizontal)
5. Shoulder press — calibrated (axis Z, shoulder height to overhead lockout)
6. Tricep pushdown — calibrated (axis X, forearm forward to straight down)

All six exercises have calculated thresholds and scoring out of the box. To record custom measured poses on any exercise, hold BOOT for 1.5 s on the board (or press **Recalibrate** on the page while connected) and follow the OLED: hold the start pose, then the end pose — about 12 seconds. Calibrations persist on the board.

- **Good form:** the rep reaches the end pose inside the tempo window (curl 3 s ±1, lateral raise 2.5 s ±1, the rest 3 s ±1).
- **Too fast / too slow:** full range, outside the window.

The older `bluetoothAndRepCounter.ino` is curl-only. The site still works with it — the exercise picker locks to Bicep curl.

The board advertises as `ESP32_BLE`.

## Testing

We ran 30 reps of each of three exercises -- bicep curl, tricep pushdown, and lateral raise -- before and after calibrating them to test for their percentage accuracy for form and rep count. We found the following results:

### % Accuracy of Form Feedback After 30 Reps per Exercise

| Exercise | % Accuracy of Form Feedback |
| -------- | --------------------------- |
| Bicep Curl (Before Calibration)   | 80%     |
| Bicep Curl (After Calibration)   | 100%     |
| Tricep Pushdown (Before Calibration)   | 70%     |
| Tricep Pushdown (After Calibration)   | 100%     |
| Lateral Raise (Before Calibration)| 63% |
| Lateral Raise (After Calibration)| 97% |

### % Accuracy of Rep Count after 30 Reps per Exercise
| Exercise | % Accuracy of Rep Count |
| -------- | ----------------------- |
| Bicep Curl | 100% |
| Tricep Pushdown | 100% |
| Lateral Raise | 93% |

Overall, after calibration, the % accuracy for all exercises was above 93%.

## Future Improvements
- Adding a battery so the watch can be used without being plugged in.
   - Additional Materials: 3.7V LiPo battery, TP4056 battery charger, boost converter, and switch.
- 3D printing the wrist enclosure to improve durability and water-proofing.
- Add ankle-strap presets for lower-body rehab exercises like sit-to-stands and leg lifts.
- Upgrade to a 6-axis IMU (accelerometer + gyroscope) to detect 3D arm tilt and bad posture.
- Build a CCCARE kinesiologist view so a professional can review multiple patients saved sessions at once.
