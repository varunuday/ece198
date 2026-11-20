// Live clock on the watch face (the only real-time thing on the home page).
const clock = document.getElementById("watchClock");

function paintClock() {
  if (!clock) return;
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

paintClock();
setInterval(paintClock, 1000);

// Fills the "Your training" row when somebody is signed in.
(function renderAccount() {
  const paint = () => {
    const section = document.getElementById("yourSection");
    if (!section || !window.Auth) return;
    const user = Auth.user();
    if (!user) return;

    const s = Auth.stats();
    section.hidden = false;
    document.getElementById("yourSessions").textContent = String(s.sessions);
    document.getElementById("yourReps").textContent = s.reps.toLocaleString();
    const scored = s.good + s.fast + s.slow;
    document.getElementById("yourGood").textContent = scored
      ? Math.round((100 * s.good) / scored) + "%"
      : "—";
    document.getElementById("yourSub").textContent = Auth.token()
      ? user + " · synced to your account"
      : user + " · saved on this browser";
  };
  paint();
  if (window.Auth && Auth.ready) Auth.ready.then(paint);
})();
