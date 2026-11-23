const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const REPS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const RESULT_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const LIVE_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26aa";
// exercise info (read/notify: "index,count,calibrated,NAME") and
// commands (write: "0".."5" select, "N" next, "R" reset reps, "C" calibrate)
const EXERCISE_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26ab";

const VERDICTS = {
  GOOD: { title: "Good form" },
  "TOO FAST": { title: "Too fast" },
  "TOO SLOW": { title: "Too slow" },
};

// Order matches exercises[] in hardware.ino — the board refers to exercises
// by index into this list.
const EXERCISES = [
  {
    name: "BICEP CURL",
    title: "Bicep curl",
    lines: ["Bicep", "curl"],
    degrees: -155,
    axis: 0,
    startAccel: 3.1,
    endAccel: -11.15,
    targetMs: 3000,
    tolMs: 1000,
    calibrated: true,
    phases: ["Arm at your side", "Lifting", "Top of the curl", "Lowering"],
    topName: "the top of the curl",
    bottomName: "the bottom",
    about: "Elbow pinned to your side. A rep counts when the forearm reaches the top and comes back down.",
  },
  {
    name: "PEC DECK",
    title: "Pec deck",
    lines: ["Pec", "deck"],
    degrees: -60,
    axis: 1,
    startAccel: -0.5,
    endAccel: 6.5,
    targetMs: 3000,
    tolMs: 1000,
    calibrated: true,
    phases: ["Arms open", "Squeezing", "Pads together", "Opening"],
    topName: "the squeeze",
    bottomName: "the start",
    about: "Arms open wide. Squeeze elbows and forearms together until pads meet in front of your chest.",
  },
  {
    name: "OVERHEAD EXT",
    title: "Overhead extension",
    lines: ["Overhead", "extension"],
    degrees: -170,
    axis: 0,
    startAccel: 9.0,
    endAccel: -9.0,
    targetMs: 3000,
    tolMs: 1000,
    calibrated: true,
    phases: ["Forearms behind head", "Extending", "Arms overhead", "Lowering"],
    topName: "full extension overhead",
    bottomName: "behind the head",
    about: "Weight behind the head, extend until both arms are straight overhead.",
  },
  {
    name: "LATERAL RAISE",
    title: "Lateral raise",
    lines: ["Lateral", "raise"],
    degrees: -95,
    axis: 0,
    startAccel: 9.0,
    endAccel: 1.0,
    targetMs: 2500,
    tolMs: 1000,
    calibrated: true,
    phases: ["Arm at your side", "Raising", "Arm horizontal", "Lowering"],
    topName: "arm horizontal",
    bottomName: "your side",
    about: "Raise the arm out to the side until it is level with the shoulder.",
  },
  {
    name: "SHOULDER PRESS",
    title: "Shoulder press",
    lines: ["Shoulder", "press"],
    degrees: -160,
    axis: 2,
    startAccel: 4.0,
    endAccel: -2.5,
    targetMs: 3000,
    tolMs: 1000,
    calibrated: true,
    phases: ["Hands at shoulders", "Pressing", "Arms overhead", "Lowering"],
    topName: "arms overhead",
    bottomName: "shoulder height",
    about: "Hands at shoulder height. Press straight up until arms are fully locked out overhead.",
  },
  {
    name: "TRICEP PUSHDN",
    title: "Tricep pushdown",
    lines: ["Tricep", "pushdown"],
    degrees: -100,
    axis: 0,
    startAccel: -2.0,
    endAccel: 9.0,
    targetMs: 3000,
    tolMs: 1000,
    calibrated: true,
    phases: ["Forearms forward", "Pushing down", "Arms straight down", "Returning"],
    topName: "arms straight down",
    bottomName: "the start",
    about: "Elbows pinned. Push the cable down until the arms are straight.",
  },
];

const ELBOW = { x: 230, y: 290 };

// Per-exercise SVG figure definitions.
// body: SVG path/circle markup for the static torso + arm context
// pivot: the {x, y} point the forearm rotates around
// forearmRest: SVG markup for the forearm at fraction=0 (start pose)
// forearmEnd: conceptual end pose (the rotation takes it there via degrees)
const FIGURES = [
  // 0 — BICEP CURL: arm hanging at side, elbow near hip
  {
    pivot: { x: 230, y: 290 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M150 140c-8 80-4 150 6 210"/>
      <path d="M188 136c10 70 6 140-2 214"/>
      <path d="M156 348c-6 40-14 80-8 120"/>
      <path d="M184 348c8 44 6 86 16 120"/>
      <path d="M196 156c18 40 28 84 34 134"/>`,
    forearm: `
      <path d="M230 290c4 48 6 96 4 142" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="234" cy="438" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M210 438h48"/><path d="M210 424v28"/><path d="M258 424v28"/>
      </g>`,
  },
  // 1 — PEC DECK: front-on body, arm extended out to side at chest level
  {
    pivot: { x: 196, y: 190 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M148 136c-6 70-4 140 4 212"/>
      <path d="M188 134c8 60 6 130 2 212"/>
      <path d="M152 348c-6 44-10 84-6 120"/>
      <path d="M186 348c6 48 8 88 14 120"/>
      <path d="M188 140c8-4 36-2 56 4"/>`,
    forearm: `
      <path d="M196 190c40 6 82 10 128 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="330" cy="196" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M330 174v46"/><path d="M318 174h24"/><path d="M318 220h24"/>
      </g>`,
  },
  // 2 — OVERHEAD EXTENSION: arms raised, elbows pointing up behind head
  {
    pivot: { x: 220, y: 158 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M148 136c-6 70-4 140 4 212"/>
      <path d="M188 134c8 60 6 130 2 212"/>
      <path d="M152 348c-6 44-10 84-6 120"/>
      <path d="M186 348c6 48 8 88 14 120"/>
      <path d="M196 150c8-30 22-50 24-70"/>`,
    forearm: `
      <path d="M220 158c4-44 8-88 6-130" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="224" cy="22" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M202 22h46"/><path d="M202 10v24"/><path d="M248 10v24"/>
      </g>`,
  },
  // 3 — LATERAL RAISE: arm at side, shoulder is the pivot (whole arm swings out)
  {
    pivot: { x: 196, y: 170 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M148 136c-6 70-4 140 4 212"/>
      <path d="M188 134c8 60 6 130 2 212"/>
      <path d="M152 348c-6 44-10 84-6 120"/>
      <path d="M186 348c6 48 8 88 14 120"/>`,
    forearm: `
      <path d="M196 170c10 44 14 90 12 140" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="206" cy="316" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M184 316h46"/><path d="M184 302v28"/><path d="M230 302v28"/>
      </g>`,
  },
  // 4 — SHOULDER PRESS: arms bent at shoulder height, forearm presses up
  {
    pivot: { x: 196, y: 190 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M148 136c-6 70-4 140 4 212"/>
      <path d="M188 134c8 60 6 130 2 212"/>
      <path d="M152 348c-6 44-10 84-6 120"/>
      <path d="M186 348c6 48 8 88 14 120"/>
      <path d="M188 142c8-4 32-2 50 6 8 6 14 20 14 42"/>`,
    forearm: `
      <path d="M196 190c8-46 12-92 10-136" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="202" cy="48" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M180 48h46"/><path d="M180 36v24"/><path d="M226 36v24"/>
      </g>`,
  },
  // 5 — TRICEP PUSHDOWN: elbow pinned at chest level, forearm swings downward
  {
    pivot: { x: 230, y: 210 },
    body: `
      <circle cx="168" cy="74" r="30"/>
      <path d="M190 66c10 4 14 14 12 24"/>
      <path d="M168 104v22"/>
      <path d="M150 140c-8 80-4 150 6 210"/>
      <path d="M188 136c10 70 6 140-2 214"/>
      <path d="M156 348c-6 40-14 80-8 120"/>
      <path d="M184 348c8 44 6 86 16 120"/>
      <path d="M196 156c14 20 24 36 34 54"/>`,
    forearm: `
      <path d="M230 210c-10 46-16 92-14 142" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="218" cy="358" r="6.5"/>
      <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M196 358h46"/><path d="M196 344v28"/><path d="M242 344v28"/>
      </g>`,
  },
];

let device = null;
let exerciseChar = null;
let previewFrame = 0;
let sawLive = false;

// --- smooth arm animation ---
// BLE arrives at ~10 Hz. We lerp the drawn fraction at 60 fps so the arm
// glides instead of jumping on each BLE packet.
let _drawnFraction = 0;        // what is currently drawn on screen
let _lerpRafId = 0;            // requestAnimationFrame handle

function startLerpLoop() {
  if (_lerpRafId) return;      // already running
  function tick() {
    const target = state.fraction;
    const diff = target - _drawnFraction;
    // fast-follow: 20% of remaining distance per frame → reaches ~95% in ~15 frames
    if (Math.abs(diff) < 0.002) {
      _drawnFraction = target;
    } else {
      _drawnFraction += diff * 0.22;
    }
    _applyForearmRotation(_drawnFraction);
    _lerpRafId = requestAnimationFrame(tick);
  }
  _lerpRafId = requestAnimationFrame(tick);
}

function stopLerpLoop() {
  if (_lerpRafId) { cancelAnimationFrame(_lerpRafId); _lerpRafId = 0; }
}

function _applyForearmRotation(frac) {
  const calibrated = isCalibrated();
  const drawn = clamp(calibrated ? frac : 0, 0, 1);
  const fig = FIGURES[state.exercise] || FIGURES[0];
  const { x, y } = fig.pivot;
  // Tricep pushdown (exercise 5): start is arms UP (bent at elbow), end is arms DOWN.
  // Invert so fraction=0 → fully rotated (arms up) and fraction=1 → no rotation (arms down).
  const isTricep = state.exercise === 5;
  const rotFrac = isTricep ? (1 - drawn) : drawn;
  const el = $("forearm");
  if (el) el.setAttribute("transform", `rotate(${ex().degrees * rotFrac} ${x} ${y})`);
  const fill = $("romFill");
  if (fill) fill.style.height = (drawn * 100).toFixed(1) + "%";
}

const encoder = new TextEncoder();
const $ = (id) => document.getElementById(id);

const state = {
  connected: false,
  preview: false,
  deviceName: "",
  live: false,
  multi: false, // the connected board speaks the multi-exercise protocol
  exercise: initialExercise(),
  calibrated: EXERCISES.map((e) => e.calibrated),
  reps: 0, // last rep number the board reported (dedup only, not displayed)
  result: "",
  fraction: 0,
  accel: null,
  phase: 0,
  lastRepMs: 0,
  loggedRep: 0,
  counts: { GOOD: 0, "TOO FAST": 0, "TOO SLOW": 0 },
  history: [],
};

function initialExercise() {
  const m = (location.hash || "").match(/ex=(\d+)/);
  const i = m ? parseInt(m[1], 10) : 0;
  return i >= 0 && i < EXERCISES.length ? i : 0;
}

const ex = () => EXERCISES[state.exercise];
const sessionReps = () =>
  state.counts.GOOD + state.counts["TOO FAST"] + state.counts["TOO SLOW"];
const isCalibrated = () => state.calibrated[state.exercise];

function tempoBounds() {
  return {
    lo: (ex().targetMs - ex().tolMs) / 1000,
    hi: (ex().targetMs + ex().tolMs) / 1000,
  };
}

function resetCounters() {
  state.reps = 0;
  state.result = "";
  state.fraction = 0;
  state.accel = null;
  state.phase = 0;
  state.lastRepMs = 0;
  state.loggedRep = 0;
  state.counts = { GOOD: 0, "TOO FAST": 0, "TOO SLOW": 0 };
  state.history = [];
  sawLive = false;
  _drawnFraction = 0;
  _lastFigureExercise = -1; // force figure redraw on next render
}

$("connectBtn").addEventListener("click", () => {
  if (state.connected) disconnect();
  else connect();
});

$("previewBtn").addEventListener("click", () => {
  if (state.preview) stopPreview();
  else startPreview();
});

$("saveBtn").addEventListener("click", saveCurrent);
$("calibrateBtn").addEventListener("click", calibrateCurrent);

// Leaving the page saves whatever is on the counter (when signed in).
window.addEventListener("beforeunload", finalizeSession);

if (!navigator.bluetooth) {
  $("connectBtn").disabled = true;
  $("statusText").textContent = "Use Chrome or Edge";
  showBanner("This browser cannot open a Bluetooth connection. Use Chrome or Edge, served from localhost, not as a file.");
}

// ---------------------------------------------------------------- sessions

function snapshot() {
  return {
    exercise: ex().name,
    title: ex().title,
    at: new Date().toISOString(),
    reps: sessionReps(),
    counts: { ...state.counts },
    lastRepMs: state.lastRepMs,
    history: state.history.slice(0, 20),
    source: state.preview ? "preview" : "board",
  };
}

// Saves the current set to the signed-in account before it leaves the screen.
function finalizeSession() {
  const total = sessionReps();
  if (total === 0) return;
  const snap = snapshot();
  if (window.Auth && Auth.user()) {
    Auth.saveSession(snap);
    showBanner(
      `Saved ${total} ${snap.title} rep${total === 1 ? "" : "s"} to ${Auth.user()}'s account.`
    );
  } else {
    showBanner(
      `${total} ${snap.title} rep${total === 1 ? "" : "s"} cleared — sign in on the Account page to keep sessions.`
    );
  }
}

function saveCurrent() {
  const total = sessionReps();
  if (total === 0) {
    showBanner("Nothing to save yet — do a few reps first.");
    return;
  }
  if (!window.Auth || !Auth.user()) {
    showBanner("Sign in to save sessions. Open Account in the nav, then come back — your reps stay on screen.");
    return;
  }
  const snap = snapshot();
  Auth.saveSession(snap);
  const n = snap.reps;
  const name = snap.title;
  resetCounters();
  // keep the board's OLED in sync with the fresh set
  if (state.connected && exerciseChar) {
    exerciseChar.writeValue(encoder.encode("R")).catch(() => {});
  }
  showBanner(
    `Saved ${n} ${name} rep${n === 1 ? "" : "s"} to ${Auth.user()}'s account. Counter reset for the next set.`
  );
  renderAll();
}

function calibrateCurrent() {
  if (state.connected && exerciseChar) {
    exerciseChar.writeValue(encoder.encode("C")).catch(() => {});
    showBanner(
      `Calibrating ${ex().title} on the board — follow the OLED: hold the start pose, then the end pose. About 12 seconds.`
    );
  } else if (state.preview) {
    state.calibrated[state.exercise] = true;
    showBanner(`${ex().title} “calibrated” for the preview. Reps will count now.`);
    restartPreview();
  } else {
    showBanner("Connect the board to calibrate — the OLED walks you through the two poses.");
  }
  renderAll();
}

// ------------------------------------------------------------- exercises

function switchExercise(i, fromBoard) {
  if (i < 0 || i >= EXERCISES.length) return;
  if (i === state.exercise) {
    renderAll();
    return;
  }
  finalizeSession();
  state.exercise = i;
  resetCounters();
  try {
    history.replaceState(null, "", "#ex=" + i);
  } catch (e) {}
  if (state.preview) restartPreview();
  if (state.connected && !fromBoard && exerciseChar) {
    exerciseChar.writeValue(encoder.encode(String(i))).catch(() => {});
  }
  renderAll();
}

// ------------------------------------------------------------------- BLE

async function connect() {
  stopPreview();
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { name: "ESP32_BLE" },
        { namePrefix: "ESP32" },
        { services: [SERVICE_UUID] },
      ],
      optionalServices: [SERVICE_UUID],
    });
    showBanner("Connecting to " + (device.name || "the board") + "…");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    const wanted = state.exercise;
    resetCounters();
    state.connected = true;
    state.deviceName = device.name || "ESP32_BLE";
    device.addEventListener("gattserverdisconnected", onDisconnected);

    const repsChar = await service.getCharacteristic(REPS_UUID);
    const resultChar = await service.getCharacteristic(RESULT_UUID);
    await listen(repsChar, onReps);
    await listen(resultChar, onResult);

    state.live = false;
    try {
      const liveChar = await service.getCharacteristic(LIVE_UUID);
      await listen(liveChar, onLive);
      state.live = true;
    } catch (err) {
      state.live = false;
    }

    state.multi = false;
    exerciseChar = null;
    try {
      exerciseChar = await service.getCharacteristic(EXERCISE_UUID);
      await listen(exerciseChar, onExerciseInfo);
      state.multi = true;
      // the board follows the exercise picked on the site
      if (state.exercise !== wanted) switchExercise(wanted);
    } catch (err) {
      exerciseChar = null;
      state.multi = false;
    }

    hideBanner();
    renderAll();
  } catch (err) {
    if (err && err.name === "NotFoundError") return;
    showBanner(err && err.message ? err.message : "Could not connect to the board.");
    state.connected = false;
    renderConnection();
  }
}

async function listen(characteristic, handler) {
  characteristic.addEventListener("characteristicvaluechanged", (event) => {
    handler(decode(event.target.value), true);
  });
  const initial = await characteristic.readValue();
  handler(decode(initial), false);
  await characteristic.startNotifications();
}

function decode(view) {
  return new TextDecoder("utf-8").decode(view).replace(/\0/g, "").trim();
}

function disconnect() {
  if (device && device.gatt.connected) device.gatt.disconnect();
  onDisconnected();
}

function onDisconnected() {
  state.connected = false;
  state.live = false;
  state.multi = false;
  exerciseChar = null;
  state.deviceName = "";
  stopLerpLoop();
  renderAll();
}

function onReps(text, fromNotify) {
  const n = parseInt(text, 10);
  if (Number.isNaN(n)) return;
  state.reps = n;
  if (!fromNotify) state.loggedRep = Math.max(state.loggedRep, n);
  renderSession();
}

function onResult(text, fromNotify) {
  if (!VERDICTS[text]) return;
  state.result = text;
  if (!fromNotify) {
    renderSession();
    return;
  }
  if (state.reps > state.loggedRep) commit(state.reps, text, state.lastRepMs);
  else
    setTimeout(() => {
      if (state.reps > state.loggedRep) commit(state.reps, text, state.lastRepMs);
    }, 150);
  renderSession();
}

function onLive(text) {
  const parts = text.split(",");
  if (parts.length < 3) return;
  const fraction = Number(parts[0]);
  const accel = Number(parts[1]);
  const phase = Number(parts[2]);
  const repMs = parts.length > 3 ? Number(parts[3]) : 0;
  if (Number.isNaN(fraction)) return;

  sawLive = true;
  state.live = true;
  state.fraction = fraction;
  state.accel = Number.isNaN(accel) ? null : accel;
  state.phase = Number.isNaN(phase) ? 0 : phase;
  if (!Number.isNaN(repMs) && repMs > 0) state.lastRepMs = repMs;
  renderLive();
}

// "index,count,calibrated,NAME" — sent on connect and on every exercise change
function onExerciseInfo(text) {
  const m = /^(\d+),(\d+),([01]),(.*)$/.exec(text);
  if (!m) return;
  const idx = parseInt(m[1], 10);
  if (idx < 0 || idx >= EXERCISES.length) return;
  state.multi = true;
  state.calibrated[idx] = m[3] === "1";
  if (idx !== state.exercise) switchExercise(idx, true);
  else renderAll();
}

function commit(rep, result, ms) {
  if (rep <= state.loggedRep || !VERDICTS[result]) return;
  state.loggedRep = rep;
  state.reps = Math.max(state.reps, rep);
  state.result = result;
  state.lastRepMs = ms || state.lastRepMs;
  state.counts[result] += 1;
  state.history.unshift({ n: sessionReps(), result, ms: state.lastRepMs, at: Date.now() });
  if (state.history.length > 20) state.history.pop();
  if (!sawLive && !state.preview) playCurl(result);
  renderAll();
}

function playCurl(result) {
  const duration = result === "TOO FAST" ? 1100 : result === "TOO SLOW" ? 2400 : 1600;
  const start = performance.now();
  cancelAnimationFrame(previewFrame);
  const frame = (now) => {
    if (sawLive || state.preview) return;
    const t = Math.min(1, (now - start) / duration);
    state.fraction = t < 0.5 ? t * 2 : (1 - t) * 2;
    state.phase = t < 0.45 ? 1 : t < 0.55 ? 2 : t < 1 ? 3 : 0;
    renderLive();
    if (t < 1) previewFrame = requestAnimationFrame(frame);
  };
  previewFrame = requestAnimationFrame(frame);
}

// --------------------------------------------------------------- preview

function previewPlan() {
  const t = ex().targetMs;
  return [
    { ms: Math.round(t * 0.95), result: "GOOD" },
    { ms: Math.round(t * 0.5), result: "TOO FAST" },
    { ms: Math.round(t * 1.05), result: "GOOD" },
    { ms: Math.round(t * 1.55), result: "TOO SLOW" },
    { ms: Math.round(t * 0.9), result: "GOOD" },
  ];
}

function startPreview() {
  if (state.connected) disconnect();
  stopPreview();
  resetCounters();
  state.preview = true;
  state.deviceName = "Preview";
  showBanner("Preview reps, not the board. Connect the ESP32 when you want the real accelerometer.");
  runPreviewLoop();
  renderAll();
}

function restartPreview() {
  if (!state.preview) return;
  cancelAnimationFrame(previewFrame);
  runPreviewLoop();
}

function runPreviewLoop() {
  if (!isCalibrated()) return; // idles until a (pretend) calibration
  const plan = previewPlan();
  let index = 0;
  let start = performance.now();

  const frame = (now) => {
    if (!state.preview || !isCalibrated()) return;
    const item = plan[index % plan.length];
    const t = (now - start) / item.ms;
    const sA = ex().startAccel ?? 3.1;
    const eA = ex().endAccel ?? -11.15;
    if (t >= 1) {
      state.fraction = 0;
      state.phase = 0;
      state.accel = sA;
      state.lastRepMs = item.ms;
      state.reps += 1;
      commit(state.reps, item.result, item.ms);
      index += 1;
      start = now;
    } else {
      const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
      state.fraction = tri;
      // preview is already at 60 fps — set drawn directly (no extra lerp needed)
      _drawnFraction = tri;
      state.phase = t < 0.42 ? 1 : t < 0.58 ? 2 : 3;
      state.accel = sA + (eA - sA) * tri;
      _applyForearmRotation(_drawnFraction);
      renderFigure();
      renderLive();
    }
    previewFrame = requestAnimationFrame(frame);
  };
  previewFrame = requestAnimationFrame(frame);
}

function stopPreview() {
  state.preview = false;
  cancelAnimationFrame(previewFrame);
  stopLerpLoop();
  hideBanner();
  renderConnection();
}

// ---------------------------------------------------------------- render

function renderAll() {
  renderConnection();
  renderChips();
  renderLive();
  renderSession();
  renderSaveStatus();
  $("exerciseTitle").innerHTML = ex().lines.join("<br>");
}

function renderSaveStatus() {
  const card = $("saveCheck");
  const state2 = $("saveState");
  if (!card || !state2) return;
  const user = window.Auth && Auth.user();
  const total = sessionReps();
  if (user) {
    card.className = "check ok";
    const where = Auth.token() ? "your account" : "this browser";
    state2.textContent =
      total > 0
        ? `${total} rep${total === 1 ? "" : "s"} ready to save to ${user} (${where}). Saves on Save session, on exercise switch, or when you leave.`
        : `Signed in as ${user}. Completed sets save to ${where} automatically.`;
  } else {
    card.className = "check";
    state2.textContent =
      "Sign in to save this set. It saves on Save session, when you switch exercises, or when you leave the page.";
  }
}

function renderConnection() {
  const status = $("status");
  status.classList.toggle("live", state.connected);
  status.classList.toggle("preview", state.preview && !state.connected);
  $("statusText").textContent = state.connected
    ? "Connected"
    : state.preview
      ? "Preview"
      : "Not connected";
  $("connectBtn").textContent = state.connected ? "Disconnect" : "Connect board";
  $("previewBtn").textContent = state.preview ? "Stop preview" : "Preview";
  $("deviceLine").textContent = state.deviceName || "ESP32_BLE";
  $("calibrateBtn").hidden = !state.connected && isCalibrated();
  $("calibrateBtn").textContent = isCalibrated() ? "Recalibrate" : "Calibrate";
}

function renderChips() {
  const wrap = $("exerciseChips");
  wrap.replaceChildren();
  // curl-only firmware: only the active exercise is reachable
  const locked = state.connected && !state.multi;

  EXERCISES.forEach((e, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (i === state.exercise ? " active" : "");
    b.disabled = locked && i !== state.exercise;
    b.textContent = e.title;
    if (!state.calibrated[i]) {
      const dot = document.createElement("span");
      dot.className = "cal-dot";
      dot.title = "Needs calibration";
      b.appendChild(dot);
    }
    b.addEventListener("click", () => switchExercise(i, false));
    wrap.appendChild(b);
  });

  const note = $("exerciseNote");
  if (locked) {
    note.textContent =
      "This board is running curl-only firmware — flash hardware.ino to unlock all six exercises.";
  } else {
    const t = tempoBounds();
    note.textContent =
      ex().about +
      ` Target tempo: ${t.lo}–${t.hi} s per rep.` +
      (isCalibrated() ? "" : " Needs a one-time calibration.");
  }
}

let _lastFigureExercise = -1;

function renderFigure() {
  const idx = state.exercise;
  if (idx === _lastFigureExercise) return;
  _lastFigureExercise = idx;

  const fig = FIGURES[idx] || FIGURES[0];

  // body
  const bodyEl = $("figureBody");
  if (bodyEl) bodyEl.innerHTML = fig.body;

  // forearm
  const forearmEl = $("forearm");
  if (forearmEl) {
    forearmEl.innerHTML = fig.forearm;
    forearmEl.setAttribute("transform", "");
  }

  // joint dot
  const joint = $("jointDot");
  if (joint) {
    joint.setAttribute("cx", fig.pivot.x);
    joint.setAttribute("cy", fig.pivot.y);
  }
}

function renderLive() {
  renderFigure();
  startLerpLoop(); // ensure smooth animation loop is running

  const calibrated = isCalibrated();
  // Use the lerped drawn fraction for the stats display
  const drawn = clamp(calibrated ? _drawnFraction : 0, 0, 1);

  const range = $("rangeCheck");
  if (!calibrated) {
    $("phaseValue").textContent = "Calibrate to start";
    $("accelValue").textContent = "—";
    $("romValue").textContent = "—";
    $("signalValue").textContent = "No calibration";
    range.className = "check";
    $("rangeState").textContent =
      ex().title + " has no start/end poses stored yet. Calibrate it and this check turns live.";
    return;
  }

  $("phaseValue").textContent =
    state.connected || state.preview || state.result
      ? ex().phases[state.phase] || ex().phases[0]
      : "Waiting for a rep";
  $("accelValue").textContent = state.accel == null ? "—" : state.accel.toFixed(1) + " m/s²";
  $("romValue").textContent =
    state.accel == null && !state.preview && !state.connected
      ? "—"
      : Math.round(drawn * 100) + "%";
  $("signalValue").textContent = state.live
    ? "Live from board"
    : state.preview
      ? "Simulated"
      : "Each rep";

  if (drawn >= 0.7) {
    range.className = "check ok";
    $("rangeState").textContent =
      "You reached " + ex().topName + ". The accelerometer crossed the end threshold.";
  } else if (drawn > 0.3) {
    range.className = "check";
    $("rangeState").textContent = "Moving, but not at " + ex().topName + " yet.";
  } else if (sessionReps() > 0) {
    range.className = "check ok";
    $("rangeState").textContent =
      "Last rep reached " + ex().topName + ". Back at " + ex().bottomName + ".";
  } else {
    range.className = "check";
    $("rangeState").textContent = "Did the rep reach " + ex().topName + "?";
  }
}

function verdictCopy(result) {
  const t = tempoBounds();
  if (result === "GOOD")
    return "You reached " + ex().topName + ` and the rep took between ${t.lo} and ${t.hi} seconds.`;
  if (result === "TOO FAST")
    return "You reached " + ex().topName + `, but the rep finished in under ${t.lo} seconds. Slow the way down.`;
  if (result === "TOO SLOW")
    return `Full range, but the rep took longer than ${t.hi} seconds.`;
  return "";
}

function renderSession() {
  const calibrated = isCalibrated();
  const verdict = $("verdict");
  const known = VERDICTS[state.result];
  verdict.dataset.result = calibrated && known ? state.result : "idle";

  if (!calibrated) {
    $("verdictTitle").textContent = "Calibrate";
    $("verdictDetail").textContent =
      ex().title +
      " isn't calibrated yet, so the board can't count it. Connect the board and press Calibrate (or hold the BOOT button for 1.5 s): the OLED asks for the start pose, then the end pose.";
  } else {
    $("verdictTitle").textContent = known
      ? known.title
      : state.connected || state.preview
        ? ex().title
        : "Ready";
    $("verdictDetail").textContent = known
      ? verdictCopy(state.result)
      : "Connect the board, then lift. A rep counts only when you reach " +
        ex().topName +
        ", and form is scored from how long the rep takes.";
  }

  $("repCount").textContent = String(sessionReps());
  const target = ex().targetMs / 1000;
  const tol = ex().tolMs / 1000;
  $("repTime").textContent =
    state.lastRepMs > 0
      ? `Last rep ${(state.lastRepMs / 1000).toFixed(1)} s. Target is ${target} s, give or take ${tol}.`
      : `Target tempo is ${target} seconds, give or take ${tol}.`;

  const t = tempoBounds();
  const tempo = $("tempoCheck");
  if (!calibrated) {
    tempo.className = "check";
    $("tempoState").textContent = "Tempo scoring turns on after calibration.";
  } else if (state.result === "GOOD") {
    tempo.className = "check ok";
    $("tempoState").textContent =
      "Tempo is in range. " + (state.lastRepMs ? (state.lastRepMs / 1000).toFixed(1) + " seconds." : "");
  } else if (state.result === "TOO FAST") {
    tempo.className = "check bad";
    $("tempoState").textContent = `Too fast. Keep the way down slower than a ${t.lo} second rep.`;
  } else if (state.result === "TOO SLOW") {
    tempo.className = "check slow";
    $("tempoState").textContent = `Too slow. A counted rep should finish inside ${t.hi} seconds.`;
  } else {
    tempo.className = "check";
    $("tempoState").textContent = `Good form is a full rep between ${t.lo} and ${t.hi} seconds. Faster is too quick. Slower risks losing tension.`;
  }

  $("countGood").textContent = String(state.counts.GOOD);
  $("countFast").textContent = String(state.counts["TOO FAST"]);
  $("countSlow").textContent = String(state.counts["TOO SLOW"]);
  $("countTotal").textContent = String(sessionReps());

  const list = $("history");
  list.replaceChildren();
  if (state.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Completed reps will list here, newest first.";
    list.appendChild(empty);
    return;
  }
  for (const item of state.history) {
    const li = document.createElement("li");
    const rep = document.createElement("strong");
    rep.textContent = "#" + item.n;
    const tag = document.createElement("span");
    tag.className =
      "tag " + (item.result === "TOO FAST" ? "FAST" : item.result === "TOO SLOW" ? "SLOW" : "GOOD");
    tag.textContent = item.result;
    const time = document.createElement("span");
    time.textContent = item.ms ? (item.ms / 1000).toFixed(1) + " s" : "";
    li.append(rep, tag, time);
    list.appendChild(li);
  }
}

function showBanner(text) {
  const banner = $("banner");
  banner.hidden = false;
  banner.textContent = text;
}

function hideBanner() {
  $("banner").hidden = true;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

renderAll();
