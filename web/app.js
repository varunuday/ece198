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
    targetMs: 3000,
    tolMs: 1000,
    calibrated: false,
    phases: ["Arms open", "Squeezing", "Pads together", "Opening"],
    topName: "the squeeze",
    bottomName: "the start",
    about: "A forearm tilt sensor can barely see the squeeze, so this one ships uncalibrated.",
  },
  {
    name: "OVERHEAD EXT",
    title: "Overhead extension",
    lines: ["Overhead", "extension"],
    degrees: -170,
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
    targetMs: 3000,
    tolMs: 1000,
    calibrated: false,
    phases: ["Hands at shoulders", "Pressing", "Arms overhead", "Lowering"],
    topName: "arms overhead",
    bottomName: "shoulder height",
    about: "Ships uncalibrated — the forearm barely tilts during a press. Calibrate it on the board to try.",
  },
  {
    name: "TRICEP PUSHDN",
    title: "Tricep pushdown",
    lines: ["Tricep", "pushdown"],
    degrees: -100,
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

let device = null;
let exerciseChar = null;
let previewFrame = 0;
let sawLive = false;

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
      filters: [{ name: "ESP32_BLE" }, { services: [SERVICE_UUID] }],
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
    if (t >= 1) {
      state.fraction = 0;
      state.phase = 0;
      state.accel = 3.1;
      state.lastRepMs = item.ms;
      state.reps += 1;
      commit(state.reps, item.result, item.ms);
      index += 1;
      start = now;
    } else {
      const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
      state.fraction = tri;
      state.phase = t < 0.42 ? 1 : t < 0.58 ? 2 : 3;
      state.accel = 3.1 + (-11.15 - 3.1) * tri;
      renderLive();
    }
    previewFrame = requestAnimationFrame(frame);
  };
  previewFrame = requestAnimationFrame(frame);
}

function stopPreview() {
  state.preview = false;
  cancelAnimationFrame(previewFrame);
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
  $("calibrateBtn").hidden = isCalibrated();
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

function renderLive() {
  const calibrated = isCalibrated();
  const drawn = clamp(calibrated ? state.fraction : 0, 0, 1);
  $("forearm").setAttribute(
    "transform",
    `rotate(${ex().degrees * drawn} ${ELBOW.x} ${ELBOW.y})`
  );
  $("romFill").style.height = (drawn * 100).toFixed(1) + "%";

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
