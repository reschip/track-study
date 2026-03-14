/* ═══════════════════════════════════════════════════════════════════════════
   Track Study — app.js
   Vanilla JS · Fetch API · Timer · Heatmap
   ═══════════════════════════════════════════════════════════════════════════ */

const API = "";

// ── State ──────────────────────────────────────────────────────────────────

let activities = [];
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

const pastelColors = [
  "pastel-rose", "pastel-peach", "pastel-amber", "pastel-lime",
  "pastel-mint", "pastel-sky", "pastel-lavender", "pastel-pink"
];

// ── Helpers ────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function fmtMinutes(sec) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function confirmAction(title, message) {
  return new Promise((resolve) => {
    const modal = $("#confirm-modal");
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;

    const btnCancel = $("#btn-confirm-cancel");
    const btnOk = $("#btn-confirm-ok");

    const cleanup = () => {
      modal.classList.remove("active");
      btnCancel.removeEventListener("click", onCancel);
      btnOk.removeEventListener("click", onOk);
    };

    const onCancel = () => { cleanup(); resolve(false); };
    const onOk = () => { cleanup(); resolve(true); };

    btnCancel.addEventListener("click", onCancel);
    btnOk.addEventListener("click", onOk);

    modal.classList.add("active");
  });
}

// ── Activities ─────────────────────────────────────────────────────────────

async function loadActivities() {
  activities = await api("/api/activities");
  renderActivities();
  populateTimerSelect();
  loadHeatmap(); // Reload heatmaps when activities change (e.g., adding an activity)
}

function renderActivities() {
  const list = $("#activity-list");
  list.innerHTML = activities
    .map((a, i) => {
      const pColor = pastelColors[i % pastelColors.length];
      return `
    <li class="activity-item ${pColor} ${a.active ? "" : "inactive"}" data-id="${a.id}">
      <div class="activity-item-header" onclick="toggleHeatmap(event, ${a.id})">
        <span class="activity-dot"></span>
        <span class="activity-name">${escHTML(a.name)}</span>
        <span class="activity-toggle-label" onclick="event.stopPropagation(); toggleActivity(${a.id})">${a.active ? "active" : "paused"}</span>
        <button class="delete-btn" onclick="event.stopPropagation(); deleteActivity(${a.id})" title="Delete activity">×</button>
      </div>
      <div class="heatmap-wrapper" id="heatmap-wrapper-${a.id}">
        <!-- Heatmap injected here -->
      </div>
    </li>`;
    })
    .join("");

  list.querySelectorAll(".activity-item").forEach((el) => {
    // The click listener for toggling activity is now on the span inside the header
    // The header itself toggles the heatmap
    // el.addEventListener("click", () => toggleActivity(+el.dataset.id)); // This is no longer needed here
  });
}

function toggleHeatmap(event, id) {
  const wrapper = $(`#heatmap-wrapper-${id}`);
  if (wrapper) wrapper.classList.toggle("active");
}

function populateTimerSelect() {
  const sel = $("#timer-activity-select");
  const prev = sel.value;
  sel.innerHTML = activities
    .filter((a) => a.active)
    .map((a) => `<option value="${a.id}">${escHTML(a.name)}</option>`)
    .join("");
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
}

async function toggleActivity(id) {
  await api(`/api/activities/${id}`, { method: "PATCH" });
  await loadActivities();
}

async function deleteActivity(id) {
  const confirmed = await confirmAction("Delete Activity", "Are you sure you want to delete this activity and all its logged sessions?");
  if (!confirmed) return;
  try {
    await api(`/api/activities/${id}`, { method: "DELETE" });
    await Promise.all([loadActivities(), loadTodayLogs()]);
  } catch (err) {
    alert("Error deleting activity: " + err.message);
  }
}

function setupAddActivity() {
  $("#add-activity-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#new-activity-name");
    const name = input.value.trim();
    if (!name) return;
    try {
      await api("/api/activities", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      input.value = "";
      await loadActivities();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ── Timer ──────────────────────────────────────────────────────────────────

function setupTimer() {
  const display = $("#timer-display");
  const btnStart = $("#btn-start");
  const btnStop = $("#btn-stop");
  const btnReset = $("#btn-reset");
  const saveGroup = $("#timer-save-group");

  btnStart.addEventListener("click", () => {
    if (timerRunning) return;
    timerRunning = true;
    display.classList.add("running");
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnReset.disabled = true;
    saveGroup.style.display = "none";

    timerInterval = setInterval(() => {
      timerSeconds++;
      display.textContent = fmtTime(timerSeconds);
    }, 1000);
  });

  btnStop.addEventListener("click", () => {
    if (!timerRunning) return;
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    display.classList.remove("running");
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnReset.disabled = false;
    if (timerSeconds > 0) saveGroup.style.display = "flex";
  });

  btnReset.addEventListener("click", () => {
    timerSeconds = 0;
    display.textContent = "00:00:00";
    btnReset.disabled = true;
    saveGroup.style.display = "none";
  });

  $("#btn-save").addEventListener("click", saveSession);
}

async function saveSession() {
  const actId = +$("#timer-activity-select").value;
  const notes = $("#session-notes").value.trim();
  if (!actId) return alert("Select an activity first");
  if (timerSeconds === 0) return alert("No time recorded");

  try {
    await api("/api/logs", {
      method: "POST",
      body: JSON.stringify({
        activity_id: actId,
        date: todayISO(),
        status: "done",
        time_seconds: timerSeconds,
        notes,
      }),
    });

    // Reset timer state
    timerSeconds = 0;
    $("#timer-display").textContent = "00:00:00";
    $("#session-notes").value = "";
    $("#timer-save-group").style.display = "none";
    $("#btn-reset").disabled = true;

    // Refresh data
    await Promise.all([loadTodayLogs(), loadHeatmap()]);
  } catch (err) {
    alert("Error saving session: " + err.message);
  }
}

// ── Today's Logs ───────────────────────────────────────────────────────────

async function loadTodayLogs() {
  const today = todayISO();
  $("#today-date").textContent = today;
  const logs = await api(`/api/logs?from_date=${today}&to_date=${today}`);
  const list = $("#log-list");
  const empty = $("#logs-empty");

  if (logs.length === 0) {
    empty.style.display = "block";
    list.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  list.innerHTML = logs
    .map(
      (l) => `
    <li class="log-item">
      <span class="log-activity">${escHTML(l.activity_name)}</span>
      <span class="log-time">${fmtMinutes(l.time_seconds)}</span>
      <span class="log-notes">${escHTML(l.notes || "—")}</span>
      <span class="log-status ${l.status}">${l.status}</span>
      <button class="delete-btn" onclick="deleteLog(${l.id})" title="Delete log">×</button>
    </li>`
    )
    .join("");
}

async function deleteLog(id) {
  const confirmed = await confirmAction("Delete Log", "Are you sure you want to delete this recorded session?");
  if (!confirmed) return;
  try {
    await api(`/api/logs/${id}`, { method: "DELETE" });
    await Promise.all([loadTodayLogs(), loadHeatmap()]);
  } catch (err) {
    alert("Error deleting log: " + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEATMAP
// ═══════════════════════════════════════════════════════════════════════════

async function loadHeatmap() {
  const data = await api("/api/heatmap");
  renderHeatmap(data);
}

function renderHeatmap(data) {
  // Group data by activity_id
  const byActivity = {};
  let maxSecOverall = 0;

  data.forEach(d => {
    if (!byActivity[d.activity_id]) byActivity[d.activity_id] = {};
    byActivity[d.activity_id][d.date] = d.total_seconds;
    if (d.total_seconds > maxSecOverall) maxSecOverall = d.total_seconds;
  });

  // Generate 371 days ending today (53 full weeks)
  const today = new Date();
  const endDay = new Date(today);
  endDay.setDate(endDay.getDate() + (6 - endDay.getDay())); // next Saturday
  const startDay = new Date(endDay);
  startDay.setDate(startDay.getDate() - (53 * 7 - 1));

  const allDates = [];
  const d = new Date(startDay);
  while (d <= endDay) {
    allDates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const t1 = maxSecOverall > 0 ? maxSecOverall * 0.15 : 900;
  const t2 = maxSecOverall > 0 ? maxSecOverall * 0.40 : 3600;
  const t3 = maxSecOverall > 0 ? maxSecOverall * 0.70 : 7200;

  function getLevel(sec) {
    if (!sec || sec === 0) return 0;
    if (sec <= t1) return 1;
    if (sec <= t2) return 2;
    if (sec <= t3) return 3;
    return 4;
  }

  // Pre-calculate month cols
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let weekCols = [];
  for (let i = 0; i < allDates.length; i += 7) {
    weekCols.push(allDates[i].getMonth());
  }

  let monthsHtml = '<span></span>';
  weekCols.forEach((m, i) => {
    monthsHtml += `<span>${m !== (i > 0 ? weekCols[i - 1] : -1) ? months[m] : ""}</span>`;
  });

  // Inject into each activity
  activities.forEach(a => {
    const wrapper = $(`#heatmap-wrapper-${a.id}`);
    if (!wrapper) return;

    const actData = byActivity[a.id] || {};

    let gridHtml = "";
    allDates.forEach((dt) => {
      const iso = dt.toISOString().slice(0, 10);
      const sec = actData[iso] || 0;
      const level = getLevel(sec);
      const isFuture = dt > today;

      let tooltip = "";
      if (!isFuture && sec > 0) tooltip = `${iso}: ${fmtMinutes(sec)}`;
      else if (!isFuture) tooltip = `${iso}: No activity`;

      gridHtml += `<div class="heatmap-cell level-${isFuture ? 0 : level}" ${tooltip ? `data-tooltip="${tooltip}"` : ""}></div>`;
    });

    wrapper.innerHTML = `
      <div class="heatmap-months">${monthsHtml}</div>
      <div class="heatmap-grid-wrapper">
        <div class="heatmap-days">
          <span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>
        </div>
        <div class="heatmap-grid">${gridHtml}</div>
      </div>
      <div class="heatmap-legend">
        <span class="legend-label">Less</span>
        <span class="heatmap-cell level-0"></span>
        <span class="heatmap-cell level-1"></span>
        <span class="heatmap-cell level-2"></span>
        <span class="heatmap-cell level-3"></span>
        <span class="heatmap-cell level-4"></span>
        <span class="legend-label">More</span>
      </div>
    `;
  });
  // The original global heatmap elements are no longer used by this function
  // $("#heatmap-year").textContent = `${allDates[0].getFullYear()} — ${today.getFullYear()}`; // This line is also removed as it's part of the global heatmap
}

// ── Utils ──────────────────────────────────────────────────────────────────

function escHTML(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ── Tabs & Insights ────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));

      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add("active");

      if (btn.dataset.target === "view-insights") {
        loadInsights();
      }
    });
  });
}

function setupManualEntry() {
  const modal = $("#manual-modal");
  const form = $("#manual-entry-form");
  const btnOpen = $("#btn-open-manual-modal");
  const btnCancel = $("#btn-manual-cancel");

  if (btnOpen) btnOpen.addEventListener("click", () => {
    // Populate activity select from timer
    const currentActivityId = $("#timer-activity-select").value;
    // We can just rely on the existing select or build a new one.
    // They share state implicitly if we use the same dropdown logic, but let's keep it simple.
    // Actually, the new modal doesn't have a select, we'll grab the one from the timer panel.
    // Wait, the user still needs to pick an activity. Let's make sure the timer-activity-select is used or add one to the modal.
    // Re-checking index.html: manual form just relies on #timer-activity-select which is currently outside the modal.
    modal.classList.add("active");
  });

  if (btnCancel) btnCancel.addEventListener("click", () => {
    modal.classList.remove("active");
    form.reset();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const activityId = $("#timer-activity-select").value;
    if (!activityId) {
      alert("Please select an activity first.");
      return;
    }

    const hrs = parseInt($("#manual-hours").value) || 0;
    const mins = parseInt($("#manual-minutes").value) || 0;
    const notes = $("#manual-notes").value.trim();

    const totalSeconds = (hrs * 3600) + (mins * 60);

    if (totalSeconds <= 0) {
      alert("Please enter a valid duration.");
      return;
    }

    const btn = $("#btn-manual-save");
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      await api("/api/logs", {
        method: "POST",
        body: JSON.stringify({
          activity_id: parseInt(activityId),
          date: new Date().toISOString().split("T")[0],
          status: "done",
          time_seconds: totalSeconds,
          notes: notes
        })
      });

      form.reset();
      modal.classList.remove("active");

      await Promise.all([loadTodayLogs(), loadHeatmap()]);
    } catch (err) {
      alert("Error saving manual entry: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Entry";
    }
  });
}

async function loadInsights() {
  try {
    const data = await api("/api/insights");

    // Streaks
    $("#val-current-streak").textContent = data.current_streak;
    $("#val-longest-streak").textContent = data.longest_streak;

    // Charts
    renderVolumeChart(data.daily_volume);
    renderDistChart(data.distribution);
  } catch (err) {
    console.error("Failed to load insights", err);
  }
}

function renderVolumeChart(dailyVolume) {
  const container = $("#chart-vol");
  if (!dailyVolume || !dailyVolume.length) {
    container.innerHTML = "<div class='logs-empty'>No data available</div>";
    return;
  }

  const maxSec = Math.max(...dailyVolume.map(d => d.total_seconds), 1);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  container.innerHTML = dailyVolume.map(d => {
    const heightPct = Math.max((d.total_seconds / maxSec) * 100, 2);
    // Parse date keeping local timezone context (naive strings)
    const dt = new Date(d.date + "T12:00:00");
    const label = days[dt.getDay()];
    const valFmt = fmtMinutes(d.total_seconds);

    return `
      <div class="bar-col">
        <div class="bar-fill" style="height: ${heightPct}%" data-val="${valFmt}"></div>
        <div class="bar-label">${label}</div>
      </div>
    `;
  }).join("");
}

function renderDistChart(distribution) {
  const container = $("#chart-dist");
  if (!distribution || !distribution.length) {
    container.innerHTML = "<div class='logs-empty'>No data available</div>";
    return;
  }

  distribution.sort((a, b) => b.total_seconds - a.total_seconds);
  const maxSec = Math.max(...distribution.map(d => d.total_seconds), 1);

  let html = "";
  distribution.forEach((d, i) => {
    const widthPct = Math.max((d.total_seconds / maxSec) * 100, 2);
    const pColor = pastelColors[i % pastelColors.length];

    html += `
      <div class="dist-row">
        <div class="dist-label" title="${escHTML(d.name)}">${escHTML(d.name)}</div>
        <div class="dist-bar-container">
          <div class="dist-bar-fill ${pColor}" style="width: ${widthPct}%"></div>
        </div>
        <div class="dist-val">${fmtMinutes(d.total_seconds)}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupAddActivity();
  setupTimer();
  setupTabs();
  setupManualEntry();
  loadActivities();
  loadTodayLogs();
  loadHeatmap();
});
