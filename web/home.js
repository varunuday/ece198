const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = document.getElementById("watchClock");
const bpmWatch = document.getElementById("watchBpm");
const bpmStat = document.getElementById("bpmStat");

function paintClock() {
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

paintClock();
setInterval(paintClock, 1000);

if (!reduce) {
  const nodes = document.querySelectorAll("[data-count]");
  const start = performance.now();
  const count = (now) => {
    const t = Math.min(1, (now - start) / 1200);
    const e = 1 - Math.pow(1 - t, 3);
    nodes.forEach((node) => {
      node.textContent = Math.round(Number(node.dataset.count) * e).toLocaleString();
    });
    if (t < 1) requestAnimationFrame(count);
  };
  requestAnimationFrame(count);

  let bpm = 76;
  const beat = () => {
    bpm += Math.round((Math.random() - 0.45) * 4);
    bpm = Math.max(68, Math.min(92, bpm));
    if (bpmWatch) bpmWatch.textContent = String(bpm);
    if (bpmStat) bpmStat.textContent = String(bpm);
    setTimeout(beat, 900 + Math.random() * 700);
  };
  setTimeout(beat, 1400);
} else {
  document.querySelectorAll("[data-count]").forEach((node) => {
    node.textContent = Number(node.dataset.count).toLocaleString();
  });
}
