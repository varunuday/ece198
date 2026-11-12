const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const REPS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const RESULT_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const LIVE_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26aa";

const VERDICTS = {
  GOOD: {
    title: "Good form",
    detail: "The arm reached the top, and the curl took between 2 and 4 seconds.",
  },
  "TOO FAST": {
    title: "Too fast",
    detail: "The curl reached the top, but it finished in under 2 seconds. Slow the way down.",
  },
  "TOO SLOW": {
    title: "Too slow",
    detail: "Full range, but the curl took longer than 4 seconds.",
  },
};

const PHASES = ["Arm at your side", "Lifting", "Top of the curl", "Lowering"];

const ELBOW = { x: 230, y: 290 };
const CURL_DEGREES = -155;

const state = emptyState();
let device = null;
let previewFrame = 0;
let sawLive = false;

const $ = (id) => document.getElementById(id);

function emptyState() {
  return {
    connected: false,
    preview: false,
    deviceName: "",
    reps: 0,
    result: "",
    fraction: 0,
    accel: null,
    phase: 0,
    lastRepMs: 0,
    loggedRep: 0,
    counts: { GOOD: 0, "TOO FAST": 0, "TOO SLOW": 0 },
    history: [],
    live: false,
  };
}

function resetSession() {
  const keep = { connected: state.connected, preview: state.preview, deviceName: state.deviceName };
  Object.assign(state, emptyState(), keep);
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

if (!navigator.bluetooth) {
  $("connectBtn").disabled = true;
  $("statusText").textContent = "Use Chrome or Edge";
  showBanner("This browser cannot open a Bluetooth connection. Use Chrome or Edge, served from localhost, not as a file.");
}

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

    resetSession();
    state.connected = true;
    state.deviceName = device.name || "ESP32_BLE";
    device.addEventListener("gattserverdisconnected", onDisconnected);

    const repsChar = await service.getCharacteristic(REPS_UUID);
    const resultChar = await service.getCharacteristic(RESULT_UUID);
    await listen(repsChar, onReps);
    await listen(resultChar, onResult);

    try {
      const liveChar = await service.getCharacteristic(LIVE_UUID);
      await listen(liveChar, onLive);
      state.live = true;
    } catch (err) {
      state.live = false;
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
  else setTimeout(() => {
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
  if (state.lastRepMs > 0) {
    $("repTime").textContent = "Last curl " + (state.lastRepMs / 1000).toFixed(1) + " s. Target is 3 seconds, give or take 1.";
  }
}

function commit(rep, result, ms) {
  if (rep <= state.loggedRep || !VERDICTS[result]) return;
  state.loggedRep = rep;
  state.reps = Math.max(state.reps, rep);
  state.result = result;
  state.lastRepMs = ms || state.lastRepMs;
  state.counts[result] += 1;
  state.history.unshift({ rep, result, ms: state.lastRepMs, at: Date.now() });
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

function startPreview() {
  if (state.connected) disconnect();
  stopPreview();
  resetSession();
  state.preview = true;
  state.deviceName = "Preview";
  showBanner("Preview curls, not the board. Connect the ESP32 when you want the real accelerometer.");

  const plan = [
    { ms: 2800, result: "GOOD" },
    { ms: 1500, result: "TOO FAST" },
    { ms: 3000, result: "GOOD" },
    { ms: 4600, result: "TOO SLOW" },
    { ms: 2500, result: "GOOD" },
  ];
  let index = 0;
  let start = performance.now();

  const frame = (now) => {
    if (!state.preview) return;
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
      state.accel = 3.1 + ( -11.15 - 3.1) * tri;
      renderLive();
    }
    previewFrame = requestAnimationFrame(frame);
  };
  previewFrame = requestAnimationFrame(frame);
  renderAll();
}

function stopPreview() {
  state.preview = false;
  cancelAnimationFrame(previewFrame);
  hideBanner();
  renderConnection();
}

function renderAll() {
  renderConnection();
  renderLive();
  renderSession();
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
}

function renderLive() {
  const drawn = clamp(state.fraction, 0, 1);
  $("forearm").setAttribute("transform", `rotate(${CURL_DEGREES * drawn} ${ELBOW.x} ${ELBOW.y})`);
  $("romFill").style.height = (drawn * 100).toFixed(1) + "%";
  $("phaseValue").textContent = state.connected || state.preview || state.result
    ? PHASES[state.phase] || PHASES[0]
    : "Waiting for a curl";
  $("accelValue").textContent = state.accel == null ? "—" : state.accel.toFixed(1) + " m/s²";
  $("romValue").textContent = state.accel == null && !state.preview && !state.connected
    ? "—"
    : Math.round(drawn * 100) + "%";
  $("signalValue").textContent = state.live
    ? "Live from board"
    : state.preview
      ? "Simulated"
      : "Each rep";

  const range = $("rangeCheck");
  if (drawn >= 0.7) {
    range.className = "check ok";
    $("rangeState").textContent = "Top of the curl reached. The accelerometer crossed the upper threshold.";
  } else if (drawn > 0.3) {
    range.className = "check";
    $("rangeState").textContent = "The arm is moving, but it has not reached the top yet.";
  } else if (state.reps > 0) {
    range.className = "check ok";
    $("rangeState").textContent = "Last counted curl reached the top. The arm is back at the bottom.";
  } else {
    range.className = "check";
    $("rangeState").textContent = "Did the curl reach the top of the movement.";
  }
}

function renderSession() {
  const verdict = $("verdict");
  const known = VERDICTS[state.result];
  verdict.dataset.result = known ? state.result : "idle";
  $("verdictTitle").textContent = known ? known.title : state.connected || state.preview ? "Curl" : "Ready";
  $("verdictDetail").textContent = known
    ? known.detail
    : "Connect the board, then curl. A rep counts only if the arm reaches the top, and form is scored from how long that curl takes.";
  $("repCount").textContent = String(state.reps);
  $("repTime").textContent = state.lastRepMs > 0
    ? "Last curl " + (state.lastRepMs / 1000).toFixed(1) + " s. Target is 3 seconds, give or take 1."
    : "Target tempo is 3 seconds, give or take 1.";

  const tempo = $("tempoCheck");
  if (state.result === "GOOD") {
    tempo.className = "check ok";
    $("tempoState").textContent = "Tempo is in range. " + (state.lastRepMs ? (state.lastRepMs / 1000).toFixed(1) + " seconds." : "");
  } else if (state.result === "TOO FAST") {
    tempo.className = "check bad";
    $("tempoState").textContent = "Too fast. Keep the lowering phase slower than a 2 second curl.";
  } else if (state.result === "TOO SLOW") {
    tempo.className = "check slow";
    $("tempoState").textContent = "Too slow. A counted curl should finish inside 4 seconds.";
  } else {
    tempo.className = "check";
    $("tempoState").textContent = "Good form is a full curl between 2 and 4 seconds. Faster is too quick. Slower risks losing tension.";
  }

  $("countGood").textContent = String(state.counts.GOOD);
  $("countFast").textContent = String(state.counts["TOO FAST"]);
  $("countSlow").textContent = String(state.counts["TOO SLOW"]);
  $("countTotal").textContent = String(state.counts.GOOD + state.counts["TOO FAST"] + state.counts["TOO SLOW"]);

  const list = $("history");
  list.replaceChildren();
  if (state.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Completed curls will list here, newest first.";
    list.appendChild(empty);
    return;
  }
  for (const item of state.history) {
    const li = document.createElement("li");
    const rep = document.createElement("strong");
    rep.textContent = "#" + item.rep;
    const tag = document.createElement("span");
    tag.className = "tag " + (item.result === "TOO FAST" ? "FAST" : item.result === "TOO SLOW" ? "SLOW" : "GOOD");
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
