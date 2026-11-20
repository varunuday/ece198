const $ = (id) => document.getElementById(id);

function fmtWhen(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  );
}

function render() {
  const user = Auth.user();
  $("authView").hidden = !!user;
  $("profileView").hidden = !user;
  Auth.renderNav();
  if (user) renderProfile(user);
}

function renderProfile(user) {
  $("profileName").textContent = user;

  const s = Auth.stats();
  $("statSessions").textContent = String(s.sessions);
  $("statReps").textContent = s.reps.toLocaleString();
  const scored = s.good + s.fast + s.slow;
  $("statGood").textContent = scored ? Math.round((100 * s.good) / scored) + "%" : "—";

  const list = $("sessionList");
  list.replaceChildren();
  const sessions = Auth.sessions();

  if (sessions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent =
      "No saved sessions yet. Run a workout on the Workout page — it saves when you press Save session, switch exercises, or leave the page.";
    list.appendChild(empty);
    return;
  }

  for (const sess of sessions) {
    const li = document.createElement("li");

    const main = document.createElement("div");
    main.className = "sess-main";
    const title = document.createElement("strong");
    title.textContent = sess.title || sess.exercise;
    const meta = document.createElement("span");
    meta.className = "sess-meta";
    const c = sess.counts || {};
    meta.textContent =
      fmtWhen(sess.at) +
      " · " + sess.reps + " reps · " +
      (c.GOOD || 0) + " good · " +
      (c["TOO FAST"] || 0) + " fast · " +
      (c["TOO SLOW"] || 0) + " slow" +
      (sess.source === "preview" ? " · preview" : "");
    main.append(title, meta);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost small";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      Auth.removeSession(sess.id);
      renderProfile(user);
    });

    li.append(main, del);
    list.appendChild(li);
  }
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("loginMsg");
  msg.className = "form-note";
  msg.textContent = "Checking…";
  const r = await Auth.login($("loginUser").value, $("loginPass").value);
  if (!r.ok) {
    msg.className = "form-note error";
    msg.textContent = r.error;
    return;
  }
  render();
});

$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("registerMsg");
  if ($("registerPass").value !== $("registerPass2").value) {
    msg.className = "form-note error";
    msg.textContent = "The two passwords do not match.";
    return;
  }
  msg.className = "form-note";
  msg.textContent = "Creating…";
  const r = await Auth.register($("registerUser").value, $("registerPass").value);
  if (!r.ok) {
    msg.className = "form-note error";
    msg.textContent = r.error;
    return;
  }
  render();
});

$("logoutBtn").addEventListener("click", () => {
  Auth.logout();
  render();
});

render();
// server accounts: re-render once the latest sessions arrive from KV
Auth.ready.then(render);
