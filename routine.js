// routine.sys — standalone routine dashboard. All data lives in localStorage on this
// device only; nothing is sent anywhere.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_COLORS = {
  sleep: "#6366f1",
  wake: "#f2a93c",
  study: "#35d0ba",
  work: "#5b8def",
  winddown: "#a78bfa",
};
const CATEGORY_LABELS = {
  sleep: "Sleep",
  wake: "Wake routine",
  study: "Study",
  work: "Work",
  winddown: "Wind-down",
};

const STORAGE_KEY = "routineSysData";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return seedData();
}

function seedData() {
  return {
    blocks: [
      { id: "b1", label: "Sleep", category: "sleep", start: "23:30", end: "07:00", days: [0, 1, 2, 3, 4, 5, 6] },
      { id: "b2", label: "Wake & morning routine", category: "wake", start: "07:00", end: "07:30", days: [0, 1, 2, 3, 4, 5, 6] },
      { id: "b3", label: "Morning study block", category: "study", start: "07:30", end: "09:00", days: [1, 2, 3, 4, 5] },
      { id: "b4", label: "Accenture training / work", category: "work", start: "09:30", end: "18:00", days: [1, 2, 3, 4, 5] },
      { id: "b5", label: "Evening study block", category: "study", start: "19:30", end: "21:30", days: [1, 2, 3, 4, 5] },
      { id: "b6", label: "Wind-down (no screens)", category: "winddown", start: "22:30", end: "23:30", days: [0, 1, 2, 3, 4, 5, 6] },
    ],
    logs: {},
  };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let data = loadData();

// --- Time helpers ---

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOvernight(block) {
  return toMinutes(block.end) <= toMinutes(block.start);
}

// Returns today's blocks in start-time order, each annotated with its status
// ("upcoming" | "progress" | "due" | "followed" | "missed") for the given date.
function getBlocksForDay(d) {
  const day = d.getDay();
  const key = dateKey(d);
  const nowMin = d.getHours() * 60 + d.getMinutes();
  const isToday = dateKey(new Date()) === key;

  return data.blocks
    .filter((b) => b.days.includes(day))
    .map((b) => {
      const startMin = toMinutes(b.start);
      const endMin = toMinutes(b.end);
      const overnight = isOvernight(b);
      const logged = data.logs[key] && data.logs[key][b.id];

      let status;
      if (logged === true) status = "followed";
      else if (logged === false) status = "missed";
      else if (!isToday) status = "missed"; // past day, never logged
      else {
        const started = overnight ? nowMin >= startMin || nowMin < endMin : nowMin >= startMin;
        const ended = overnight ? false : nowMin >= endMin;
        if (!started) status = "upcoming";
        else if (started && !ended) status = "progress";
        else status = "due";
      }

      return { ...b, startMin, endMin, overnight, status };
    })
    .sort((a, b) => a.startMin - b.startMin);
}

// --- Rendering: timeline ---

function renderTimeline() {
  const now = new Date();
  document.getElementById("todayLabel").textContent = now
    .toDateString()
    .toUpperCase();

  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";
  const blocks = getBlocksForDay(now);
  const seenCats = new Set();

  blocks.forEach((b) => {
    seenCats.add(b.category);
    if (b.overnight) {
      addSegment(timeline, b, b.startMin, 1440, b.label);
      addSegment(timeline, b, 0, b.endMin, "");
    } else {
      addSegment(timeline, b, b.startMin, b.endMin, b.label);
    }
  });

  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const nowLine = document.createElement("div");
  nowLine.className = "now-line";
  nowLine.style.left = (nowMin / 1440) * 100 + "%";
  timeline.appendChild(nowLine);

  const scale = document.getElementById("timelineScale");
  scale.innerHTML = "";
  for (let h = 0; h <= 24; h += 3) {
    const span = document.createElement("span");
    span.textContent = String(h).padStart(2, "0");
    scale.appendChild(span);
  }

  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  seenCats.forEach((cat) => {
    const item = document.createElement("span");
    item.innerHTML = `<i style="background:${CATEGORY_COLORS[cat]}"></i>${CATEGORY_LABELS[cat]}`;
    legend.appendChild(item);
  });

  renderStatusLine(blocks, nowMin);
}

function addSegment(container, block, startMin, endMin, label) {
  const seg = document.createElement("div");
  seg.className = "tl-block";
  seg.style.left = (startMin / 1440) * 100 + "%";
  seg.style.width = Math.max(0, ((endMin - startMin) / 1440) * 100) + "%";
  seg.style.background = CATEGORY_COLORS[block.category];
  seg.textContent = label;
  seg.title = `${block.label} (${formatMinutes(block.startMin)}–${formatMinutes(block.endMin)})`;
  container.appendChild(seg);
}

function renderStatusLine(blocks, nowMin) {
  const current = blocks.find((b) => b.status === "progress");
  const dueCount = blocks.filter((b) => b.status === "due").length;
  const statusEl = document.getElementById("statusLine");
  const nextEl = document.getElementById("nextLine");

  if (dueCount > 0) {
    statusEl.textContent = `STATUS: ${dueCount} block${dueCount > 1 ? "s" : ""} awaiting log`;
    statusEl.className = "warn";
  } else if (current) {
    statusEl.textContent = `STATUS: in progress — ${current.label}`;
    statusEl.className = "ok";
  } else {
    statusEl.textContent = "STATUS: on track";
    statusEl.className = "ok";
  }

  const upcoming = blocks
    .filter((b) => b.status === "upcoming")
    .sort((a, b) => a.startMin - b.startMin)[0];
  if (upcoming) {
    const diff = upcoming.startMin - nowMin;
    nextEl.textContent = `NEXT: ${upcoming.label} in ${Math.max(0, Math.round(diff))}m`;
  } else {
    nextEl.textContent = "NEXT: —";
  }
}

// --- Rendering: block log ---

function renderBlockList() {
  const now = new Date();
  const blocks = getBlocksForDay(now);
  const container = document.getElementById("blockList");
  container.innerHTML = "";

  if (!blocks.length) {
    container.innerHTML = '<div class="empty-state">No blocks scheduled for today. Add some via "Edit routine".</div>';
    return;
  }

  blocks.forEach((b) => {
    const row = document.createElement("div");
    row.className = "block-row";

    const statusLabelMap = {
      upcoming: "UPCOMING",
      progress: "IN PROGRESS",
      due: "LOG NOW",
      followed: "FOLLOWED",
      missed: "MISSED",
    };

    row.innerHTML = `
      <span class="block-time">${formatMinutes(b.startMin)}–${formatMinutes(b.endMin)}</span>
      <span class="block-cat-dot" style="background:${CATEGORY_COLORS[b.category]}"></span>
      <span class="block-label">${b.label}</span>
      <span class="block-status ${b.status}">${statusLabelMap[b.status]}</span>
    `;

    const canLog = b.status === "progress" || b.status === "due" || b.status === "followed" || b.status === "missed";
    if (canLog) {
      const key = dateKey(now);
      const logged = data.logs[key] && data.logs[key][b.id];
      const btnWrap = document.createElement("div");
      btnWrap.className = "check-btns";

      const yesBtn = document.createElement("button");
      yesBtn.className = "check-btn yes" + (logged === true ? " active" : "");
      yesBtn.textContent = "✓ Followed";
      yesBtn.addEventListener("click", () => logBlock(key, b.id, true));

      const noBtn = document.createElement("button");
      noBtn.className = "check-btn no" + (logged === false ? " active" : "");
      noBtn.textContent = "✕ Missed";
      noBtn.addEventListener("click", () => logBlock(key, b.id, false));

      btnWrap.appendChild(yesBtn);
      btnWrap.appendChild(noBtn);
      row.appendChild(btnWrap);
    }

    container.appendChild(row);
  });
}

function logBlock(key, blockId, followed) {
  if (!data.logs[key]) data.logs[key] = {};
  data.logs[key][blockId] = followed;
  saveData();
  renderAll();
}

// --- Streak & heatmap ---

function computeSleepStreak() {
  let streak = 0;
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1); // start from yesterday; today isn't finished yet
  while (true) {
    const key = dateKey(cursor);
    const log = data.logs[key];
    if (log && log["b1"] === true) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function dayCompletionRatio(key, dayOfWeek) {
  const blocksThatDay = data.blocks.filter((b) => b.days.includes(dayOfWeek));
  if (!blocksThatDay.length) return null;
  const log = data.logs[key] || {};
  let followed = 0;
  let logged = 0;
  blocksThatDay.forEach((b) => {
    if (log[b.id] === true) {
      followed++;
      logged++;
    } else if (log[b.id] === false) {
      logged++;
    }
  });
  if (logged === 0) return null;
  return followed / blocksThatDay.length;
}

function heatColor(ratio) {
  if (ratio === null) return "var(--surface-2)";
  if (ratio === 0) return "rgba(239,91,91,0.35)";
  if (ratio < 0.5) return "rgba(242,169,60,0.4)";
  if (ratio < 0.85) return "rgba(53,208,186,0.45)";
  return "rgba(53,208,186,0.9)";
}

function renderHeatmap() {
  const grid = document.getElementById("heatmap");
  grid.innerHTML = "";
  const weeks = 10;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Align to the most recent Sunday so columns are clean weeks
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7 + 1);

  let loggedDays = 0;
  let goodDays = 0;

  const cursor = new Date(start);
  while (cursor <= end) {
    const key = dateKey(cursor);
    const ratio = cursor > today ? null : dayCompletionRatio(key, cursor.getDay());
    if (ratio !== null) {
      loggedDays++;
      if (ratio >= 0.85) goodDays++;
    }
    const cell = document.createElement("div");
    cell.className = "hm-cell";
    cell.style.background = heatColor(ratio);
    if (cursor <= today) {
      cell.title = `${cursor.toDateString()}: ${ratio === null ? "no log" : Math.round(ratio * 100) + "% followed"}`;
    }
    grid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }

  document.getElementById("heatmapStats").textContent =
    loggedDays > 0 ? `${goodDays}/${loggedDays} logged days ≥85% followed` : "No logs yet";
}

function renderStreak() {
  const streak = computeSleepStreak();
  document.getElementById("streakBadge").textContent = `🔥 ${streak}-day sleep streak`;
}

// --- Edit modal ---

function openModal() {
  renderEditList();
  renderDayChips();
  document.getElementById("modalBackdrop").classList.add("open");
}
function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
}

function renderEditList() {
  const list = document.getElementById("editBlockList");
  list.innerHTML = "";
  data.blocks
    .slice()
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .forEach((b) => {
      const row = document.createElement("div");
      row.className = "edit-row";
      row.innerHTML = `
        <span class="block-cat-dot" style="background:${CATEGORY_COLORS[b.category]}"></span>
        <span class="edit-label">${b.label} <span class="dim">(${b.days.length === 7 ? "daily" : b.days.map((d) => DAY_NAMES[d]).join(",")})</span></span>
        <span class="edit-time">${b.start}–${b.end}</span>
      `;
      const delBtn = document.createElement("button");
      delBtn.textContent = "✕";
      delBtn.title = "Delete block";
      delBtn.addEventListener("click", () => {
        data.blocks = data.blocks.filter((x) => x.id !== b.id);
        saveData();
        renderEditList();
        renderAll();
      });
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  if (!data.blocks.length) {
    list.innerHTML = '<div class="empty-state">No blocks yet.</div>';
  }
}

let newBlockDays = new Set([0, 1, 2, 3, 4, 5, 6]);

function renderDayChips() {
  const wrap = document.getElementById("newDayChips");
  wrap.innerHTML = "";
  DAY_NAMES.forEach((name, idx) => {
    const chip = document.createElement("div");
    chip.className = "day-chip" + (newBlockDays.has(idx) ? " active" : "");
    chip.textContent = name;
    chip.addEventListener("click", () => {
      if (newBlockDays.has(idx)) newBlockDays.delete(idx);
      else newBlockDays.add(idx);
      renderDayChips();
    });
    wrap.appendChild(chip);
  });
}

function handleAddBlock(e) {
  e.preventDefault();
  const label = document.getElementById("newLabel").value.trim();
  const category = document.getElementById("newCategory").value;
  const start = document.getElementById("newStart").value;
  const end = document.getElementById("newEnd").value;
  if (!label || !start || !end || !newBlockDays.size) {
    alert("Fill in a label, start/end time, and pick at least one day.");
    return;
  }
  data.blocks.push({
    id: "b" + Date.now().toString(36),
    label,
    category,
    start,
    end,
    days: Array.from(newBlockDays).sort(),
  });
  saveData();
  document.getElementById("addBlockForm").reset();
  newBlockDays = new Set([0, 1, 2, 3, 4, 5, 6]);
  renderDayChips();
  renderEditList();
  renderAll();
}

// --- Reminders ---

let remindersEnabled = false;
let firedToday = new Set();

function enableReminders() {
  if (!("Notification" in window)) {
    document.getElementById("reminderStatus").textContent = "Notifications aren't supported in this browser.";
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      remindersEnabled = true;
      document.getElementById("reminderStatus").textContent = "Enabled — keep this tab open.";
    } else {
      document.getElementById("reminderStatus").textContent = "Permission denied.";
    }
  });
}

function checkReminders() {
  if (!remindersEnabled) return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const key = dateKey(now) + "-" + nowMin;
  const blocks = getBlocksForDay(now);
  blocks.forEach((b) => {
    const fireKey = dateKey(now) + "-" + b.id;
    if (b.startMin === nowMin && !firedToday.has(fireKey)) {
      firedToday.add(fireKey);
      new Notification(b.label, {
        body: `Starting now — ${formatMinutes(b.startMin)} to ${formatMinutes(b.endMin)}`,
      });
    }
  });
}

// --- Wire up & init ---

function renderAll() {
  renderTimeline();
  renderBlockList();
  renderHeatmap();
  renderStreak();
}

document.getElementById("editRoutineBtn").addEventListener("click", openModal);
document.getElementById("closeModalBtn").addEventListener("click", closeModal);
document.getElementById("modalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "modalBackdrop") closeModal();
});
document.getElementById("addBlockForm").addEventListener("submit", handleAddBlock);
document.getElementById("enableRemindersBtn").addEventListener("click", enableReminders);

renderAll();
setInterval(renderAll, 30000);
setInterval(checkReminders, 15000);
