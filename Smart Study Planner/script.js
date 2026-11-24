/* Studyflow — working study planner. Data and theme are saved in localStorage. */
(function () {
  "use strict";

  const STORAGE_KEY = "studyflow.app.v1";
  const THEME_KEY = "studyflow-theme";
  const PALETTE = [
    { name: "Indigo", value: "#5142cf" }, { name: "Blue", value: "#2f80b6" },
    { name: "Green", value: "#1c8a68" }, { name: "Amber", value: "#a86410" },
    { name: "Pink", value: "#c0659b" }, { name: "Teal", value: "#0e8f8c" }
  ];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, "0");

  function parseISO(value) {
    const parts = String(value || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function toISO(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function todayISO() { return toISO(new Date()); }
  function addDays(iso, amount) { const date = parseISO(iso); date.setDate(date.getDate() + amount); return toISO(date); }
  function mondayOf(iso) {
    const date = parseISO(iso || todayISO());
    const dayIndex = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - dayIndex);
    return toISO(date);
  }
  function formatDate(iso, withYear) {
    const date = parseISO(iso);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: withYear ? "numeric" : undefined });
  }
  function formatDay(iso) { return DAYS[(parseISO(iso).getDay() + 6) % 7] + " " + parseISO(iso).getDate(); }
  function formatMinutes(value) {
    const minutes = Math.max(0, Math.round(Number(value || 0)));
    if (minutes < 60) return minutes + "m";
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? hours + "h " + rest + "m" : hours + "h";
  }

  /* ---------- State ---------- */
  function emptyState() { return { subjects: [], tasks: [] }; }
  function normalize(raw) {
    if (!raw || typeof raw !== "object") return emptyState();
    const subjects = Array.isArray(raw.subjects) ? raw.subjects.filter(s => s && typeof s === "object").map(s => ({
      id: String(s.id || uid()), name: String(s.name || "Subject"), color: String(s.color || PALETTE[0].value)
    })) : [];
    return {
      subjects,
      tasks: Array.isArray(raw.tasks) ? raw.tasks.filter(t => t && typeof t === "object").map(t => ({
        id: String(t.id || uid()),
        title: String(t.title || "Study task"),
        subjectId: String(t.subjectId || ""),
        minutes: Number(t.minutes) > 0 ? Number(t.minutes) : 25,
        completedMinutes: Number(t.completedMinutes) >= 0 ? Number(t.completedMinutes) : 0,
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayISO(),
        priority: ["high", "normal", "low"].includes(t.priority) ? t.priority : "normal",
        done: Boolean(t.done)
      })) : []
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch (error) { return emptyState(); }
  }

  let state = loadState();
  let editingTaskId = null;
  let selectedDay = "all";
  let toastTimer = null;
  let timer = { interval: null, running: false, total: 25 * 60, remaining: 25 * 60, taskId: "" };

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { toast("Could not save in this browser."); }
  }
  function toast(message) {
    const el = $("app-status");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function subjectById(id) { return state.subjects.find(subject => subject.id === id); }
  function subjectName(id) { const subject = subjectById(id); return subject ? subject.name : "Unassigned"; }
  function subjectColor(id) { const subject = subjectById(id); return subject ? subject.color : "#8a8fa8"; }

  function sampleState() {
    const monday = mondayOf(todayISO());
    const day = n => addDays(monday, n);
    const subjects = [
      { id: uid(), name: "Biology", color: PALETTE[0].value },
      { id: uid(), name: "Maths", color: PALETTE[1].value },
      { id: uid(), name: "History", color: PALETTE[4].value },
      { id: uid(), name: "Chemistry", color: PALETTE[2].value }
    ];
    return normalize({
      subjects,
      tasks: [
        { id: uid(), title: "Cell structure notes", subjectId: subjects[0].id, minutes: 60, completedMinutes: 60, date: day(0), priority: "high", done: true },
        { id: uid(), title: "Maths practice set", subjectId: subjects[1].id, minutes: 45, completedMinutes: 20, date: day(1), priority: "high", done: false },
        { id: uid(), title: "Lab report draft", subjectId: subjects[3].id, minutes: 70, completedMinutes: 0, date: day(2), priority: "normal", done: false },
        { id: uid(), title: "History timeline review", subjectId: subjects[2].id, minutes: 50, completedMinutes: 50, date: day(3), priority: "normal", done: true },
        { id: uid(), title: "Weekly review + next plan", subjectId: "", minutes: 30, completedMinutes: 0, date: day(4), priority: "low", done: false }
      ]
    });
  }

  /* ---------- Theme ---------- */
  function setupTheme() {
    const toggle = $("theme-toggle");
    const root = document.documentElement;
    function apply(isDark, save) {
      root.dataset.theme = isDark ? "dark" : "light";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", isDark ? "#101124" : "#f6f5fc");
      if (save) { try { localStorage.setItem(THEME_KEY, isDark ? "dark" : "light"); } catch (e) {} }
    }
    apply(root.dataset.theme === "dark", false);
    toggle.addEventListener("click", () => apply(root.dataset.theme !== "dark", true));
  }

  /* ---------- Selects and forms ---------- */
  function fillSubjectSelects() {
    const previousTaskSubject = $("task-subject").value;
    const previousFilter = $("task-filter-subject").value;
    const options = state.subjects.map(subject =>
      '<option value="' + esc(subject.id) + '">' + esc(subject.name) + "</option>"
    ).join("");
    $("task-subject").innerHTML = '<option value="">Unassigned</option>' + options;
    $("task-filter-subject").innerHTML = '<option value="all">All subjects</option>' + options;
    if (previousTaskSubject && state.subjects.some(subject => subject.id === previousTaskSubject)) $("task-subject").value = previousTaskSubject;
    if (previousFilter === "all" || state.subjects.some(subject => subject.id === previousFilter)) $("task-filter-subject").value = previousFilter;
    if (!$("subject-color").options.length) {
      $("subject-color").innerHTML = PALETTE.map(color =>
        '<option value="' + color.value + '">' + color.name + "</option>"
      ).join("");
    }
  }

  function resetTaskForm() {
    $("task-form").reset();
    $("task-date").value = todayISO();
    $("task-minutes").value = 25;
    editingTaskId = null;
    $("task-mode-badge").textContent = "New task";
    $("task-submit").innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg> Add task';
    $("task-cancel").hidden = true;
    $("task-error").hidden = true;
    $("task-title").removeAttribute("aria-invalid");
    $("task-minutes").removeAttribute("aria-invalid");
  }

  function startTaskEdit(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    editingTaskId = id;
    $("task-title").value = task.title;
    $("task-subject").value = task.subjectId;
    $("task-minutes").value = task.minutes;
    $("task-date").value = task.date;
    $("task-priority").value = task.priority;
    $("task-mode-badge").textContent = "Editing";
    $("task-submit").innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg> Save changes';
    $("task-cancel").hidden = false;
    $("add-task").scrollIntoView({ behavior: "smooth", block: "start" });
    $("task-title").focus({ preventScroll: true });
  }

  /* ---------- Rendering ---------- */
  function weekStart() { return $("week-start").value || mondayOf(todayISO()); }
  function weekTasks() {
    const start = weekStart();
    const end = addDays(start, 6);
    return state.tasks.filter(task => task.date >= start && task.date <= end);
  }

  function renderOverview() {
    const start = weekStart();
    const tasks = weekTasks();
    const planned = tasks.reduce((sum, task) => sum + Number(task.minutes || 0), 0);
    const completed = tasks.reduce((sum, task) => sum + Math.min(Number(task.completedMinutes || 0), Number(task.minutes || 0)), 0);
    const done = tasks.filter(task => task.done).length;
    $("overview-week-label").textContent = "Week of " + formatDate(start) + " – " + formatDate(addDays(start, 6), true);
    $("stat-planned").textContent = formatMinutes(planned);
    $("stat-completed").textContent = formatMinutes(completed);
    $("stat-done").textContent = done + " / " + tasks.length;
    $("stat-task-count").textContent = tasks.length + (tasks.length === 1 ? " task" : " tasks");
    $("stat-remaining").textContent = formatMinutes(Math.max(planned - completed, 0));
  }

  function renderSubjects() {
    const list = $("subject-list");
    if (!state.subjects.length) {
      list.innerHTML = '<div class="empty-state">No subjects yet. Add one above.</div>';
      return;
    }
    list.innerHTML = state.subjects.map(subject => {
      const count = state.tasks.filter(task => task.subjectId === subject.id).length;
      return '<div class="subject-row"><span class="subject-swatch" style="background:' + esc(subject.color) + '"></span>' +
        "<strong>" + esc(subject.name) + "</strong><small>" + count + (count === 1 ? " task" : " tasks") + "</small>" +
        '<button class="icon-btn" type="button" data-subject-delete="' + esc(subject.id) + '" aria-label="Delete ' + esc(subject.name) + '"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg></button></div>';
    }).join("");
  }

  function renderDayTabs() {
    const start = weekStart();
    const tabs = $('day-tabs');
    const options = [{ id: "all", label: "Week" }].concat(
      DAYS.map((name, index) => ({ id: addDays(start, index), label: name + " " + parseISO(addDays(start, index)).getDate() }))
    );
    if (!options.some(option => option.id === selectedDay)) selectedDay = "all";
    tabs.innerHTML = options.map(option => {
      const active = option.id === selectedDay;
      return '<button class="day-tab' + (active ? " is-active" : "") + '" type="button" role="tab" aria-selected="' + active + '" tabindex="' + (active ? "0" : "-1") + '" data-day="' + esc(option.id) + '">' + esc(option.label) + "</button>";
    }).join("");
  }

  function renderSchedule() {
    const tasks = weekTasks().filter(task => selectedDay === "all" || task.date === selectedDay)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    const planned = tasks.reduce((sum, task) => sum + Number(task.minutes || 0), 0);
    const completed = tasks.reduce((sum, task) => sum + Math.min(Number(task.completedMinutes || 0), Number(task.minutes || 0)), 0);
    $("day-summary").innerHTML = "<span>" + (selectedDay === "all" ? "Whole week" : formatDate(selectedDay)) + "</span><span><strong>" + tasks.length + "</strong> tasks · <strong>" + formatMinutes(planned) + "</strong> planned · <strong>" + formatMinutes(completed) + "</strong> done</span>";
    const container = $("day-tasks");
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">No tasks on this day. Add one with this date above.</div>';
      return;
    }
    container.innerHTML = tasks.map(task =>
      '<div class="schedule-item">' +
      '<span class="time">' + esc(formatDay(task.date)) + "</span>" +
      '<span class="subject-tag"><i style="background:' + esc(subjectColor(task.subjectId)) + '"></i>' + esc(task.title) + "<small> · " + esc(subjectName(task.subjectId)) + "</small></span>" +
      '<span class="minutes-pill">' + formatMinutes(task.minutes) + "</span>" +
      (task.done ? '<span class="done-mark">Done</span>' : '<button class="check-btn" type="button" data-toggle="' + esc(task.id) + '" aria-label="Mark ' + esc(task.title) + ' done"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg></button>') +
      "</div>"
    ).join("");
  }

  function renderProgress() {
    const tasks = weekTasks();
    const grouped = {};
    tasks.forEach(task => {
      const key = task.subjectId || "unassigned";
      if (!grouped[key]) grouped[key] = { name: subjectName(task.subjectId), color: subjectColor(task.subjectId), planned: 0, completed: 0 };
      grouped[key].planned += Number(task.minutes || 0);
      grouped[key].completed += Math.min(Number(task.completedMinutes || 0), Number(task.minutes || 0));
    });
    const entries = Object.values(grouped);
    if (!entries.length) {
      $("progress-list").innerHTML = '<div class="empty-state">Add tasks with dates in this week to see progress.</div>';
      return;
    }
    $("progress-list").innerHTML = entries.map(item => {
      const pct = item.planned ? Math.min((item.completed / item.planned) * 100, 100) : 0;
      return '<div class="progress-item"><div class="progress-meta"><span>' + esc(item.name) + "</span><strong>" + pct.toFixed(0) + "%</strong></div>" +
        '<div class="progress-track"><span style="--w:' + pct.toFixed(1) + '%;background:' + esc(item.color) + '"></span></div>' +
        '<div class="progress-foot"><span>' + formatMinutes(item.completed) + " done</span><span>" + formatMinutes(item.planned) + " planned</span></div></div>";
    }).join("");
  }

  function renderTimerOptions() {
    const select = $("timer-task");
    const current = timer.taskId || select.value;
    select.innerHTML = '<option value="">Choose a task…</option>' + state.tasks.map(task =>
      '<option value="' + esc(task.id) + '">' + esc(task.title) + " · " + esc(subjectName(task.subjectId)) + "</option>"
    ).join("");
    if (current && state.tasks.some(task => task.id === current)) select.value = current;
  }

  function renderTasks() {
    const search = $("task-search").value.trim().toLowerCase();
    const subject = $("task-filter-subject").value;
    const status = $("task-filter-status").value;
    const tasks = state.tasks.filter(task => {
      if (subject !== "all" && task.subjectId !== subject) return false;
      if (status === "done" && !task.done) return false;
      if (status === "todo" && task.done) return false;
      if (search && !(task.title + " " + subjectName(task.subjectId)).toLowerCase().includes(search)) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

    $("task-count").textContent = tasks.length + (tasks.length === 1 ? " task" : " tasks") + " in view";
    const container = $("task-list");
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state">No tasks match these filters.</div>';
      return;
    }
    container.innerHTML = tasks.map(task =>
      '<div class="task-row' + (task.done ? " is-done" : "") + '">' +
      '<span class="task-name">' + esc(task.title) + "<small>" + esc(subjectName(task.subjectId)) + " · " + esc(formatDate(task.date)) + "</small></span>" +
      '<span class="subject-tag"><i class="subject-swatch" style="background:' + esc(subjectColor(task.subjectId)) + '"></i>' + esc(subjectName(task.subjectId)) + "</span>" +
      '<span>' + formatMinutes(task.completedMinutes) + " / " + formatMinutes(task.minutes) + "</span>" +
      '<span class="priority ' + esc(task.priority) + '">' + esc(task.priority) + "</span>" +
      '<span class="row-actions">' +
      '<button class="check-btn' + (task.done ? " is-done" : "") + '" type="button" data-toggle="' + esc(task.id) + '" aria-label="' + (task.done ? "Reopen " : "Complete ") + esc(task.title) + '"><svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg></button>' +
      '<button class="icon-btn" type="button" data-edit="' + esc(task.id) + '" aria-label="Edit ' + esc(task.title) + '"><svg class="icon" aria-hidden="true"><use href="#i-edit"></use></svg></button>' +
      '<button class="icon-btn" type="button" data-delete="' + esc(task.id) + '" aria-label="Delete ' + esc(task.title) + '"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg></button>' +
      "</span></div>"
    ).join("");
  }

  function renderAll() {
    fillSubjectSelects();
    renderOverview();
    renderSubjects();
    renderDayTabs();
    renderSchedule();
    renderProgress();
    renderTimerOptions();
    renderTasks();
  }

  /* ---------- Focus timer ---------- */
  function updateTimerDisplay() {
    $("timer-display").textContent = pad(Math.floor(timer.remaining / 60)) + ":" + pad(timer.remaining % 60);
  }
  function setTimerButtons() {
    $("timer-start").innerHTML = timer.running
      ? '<svg class="icon" aria-hidden="true"><use href="#i-pause"></use></svg> Pause'
      : '<svg class="icon" aria-hidden="true"><use href="#i-play"></use></svg> Start';
    $("timer-task").disabled = timer.running;
    $("timer-minutes").disabled = timer.running;
  }
  function resetTimer() {
    clearInterval(timer.interval);
    timer.interval = null;
    timer.running = false;
    timer.total = Math.max(1, Number($("timer-minutes").value) || 25) * 60;
    timer.remaining = timer.total;
    updateTimerDisplay();
    setTimerButtons();
  }
  function finishTimer() {
    clearInterval(timer.interval);
    timer.interval = null;
    timer.running = false;
    const minutes = Math.round(timer.total / 60);
    const task = state.tasks.find(item => item.id === timer.taskId);
    if (task) {
      task.completedMinutes = Number(task.completedMinutes || 0) + minutes;
      if (task.completedMinutes >= task.minutes) task.done = true;
      saveState();
      toast(minutes + " min logged to " + task.title + ".");
    }
    renderAll();
    resetTimer();
  }
  function toggleTimer() {
    if (timer.running) {
      clearInterval(timer.interval);
      timer.interval = null;
      timer.running = false;
      setTimerButtons();
      toast("Timer paused.");
      return;
    }
    timer.taskId = $("timer-task").value;
    if (!timer.taskId) { toast("Choose a task to focus on first."); return; }
    if (timer.remaining <= 0) resetTimer();
    if (timer.remaining === timer.total && Math.round(timer.total / 60) !== (Number($("timer-minutes").value) || 25)) resetTimer();
    timer.running = true;
    setTimerButtons();
    timer.interval = setInterval(() => {
      timer.remaining -= 1;
      updateTimerDisplay();
      if (timer.remaining <= 0) finishTimer();
    }, 1000);
    toast("Focus session started.");
  }

  /* ---------- Shared task action ---------- */
  function toggleTaskDone(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    task.done = !task.done;
    task.completedMinutes = task.done ? task.minutes : 0;
    saveState();
    renderAll();
    toast(task.done ? "Task marked done." : "Task reopened.");
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    $("task-form").addEventListener("submit", event => {
      event.preventDefault();
      const title = $("task-title").value.trim();
      const minutes = Number($("task-minutes").value);
      const date = $("task-date").value;
      const error = $("task-error");
      if (!title) {
        error.textContent = "Add a task name."; error.hidden = false;
        $("task-title").setAttribute("aria-invalid", "true"); $("task-title").focus(); return;
      }
      if (!(minutes > 0)) {
        error.textContent = "Enter planned minutes greater than zero."; error.hidden = false;
        $("task-minutes").setAttribute("aria-invalid", "true"); $("task-minutes").focus(); return;
      }
      if (!date) { error.textContent = "Choose a study date."; error.hidden = false; return; }
      error.hidden = true;
      $("task-title").removeAttribute("aria-invalid");
      $("task-minutes").removeAttribute("aria-invalid");

      const data = {
        title,
        subjectId: $("task-subject").value,
        minutes,
        date,
        priority: $("task-priority").value
      };
      if (editingTaskId) {
        const task = state.tasks.find(item => item.id === editingTaskId);
        if (task) Object.assign(task, data);
        toast("Task updated.");
      } else {
        state.tasks.push(Object.assign({ id: uid(), completedMinutes: 0, done: false }, data));
        toast("Task added to your plan.");
      }
      saveState();
      resetTaskForm();
      renderAll();
    });
    $("task-cancel").addEventListener("click", () => { resetTaskForm(); toast("Edit cancelled."); });
    $("task-title").addEventListener("input", () => { $("task-error").hidden = true; $("task-title").removeAttribute("aria-invalid"); });
    $("task-minutes").addEventListener("input", () => { $("task-error").hidden = true; $("task-minutes").removeAttribute("aria-invalid"); });

    $("subject-form").addEventListener("submit", event => {
      event.preventDefault();
      const name = $("subject-name").value.trim();
      if (!name) { toast("Add a subject name."); return; }
      state.subjects.push({ id: uid(), name, color: $("subject-color").value });
      $("subject-name").value = "";
      saveState(); renderAll(); toast("Subject added.");
    });
    $("subject-list").addEventListener("click", event => {
      const button = event.target.closest("[data-subject-delete]");
      if (!button) return;
      const subject = state.subjects.find(item => item.id === button.dataset.subjectDelete);
      if (!subject || !confirm('Delete subject "' + subject.name + '"? Its tasks will stay as Unassigned.')) return;
      state.subjects = state.subjects.filter(item => item.id !== subject.id);
      state.tasks.forEach(task => { if (task.subjectId === subject.id) task.subjectId = ""; });
      saveState(); renderAll(); toast("Subject removed.");
    });

    $("week-start").addEventListener("change", () => {
      selectedDay = "all";
      renderAll();
    });

    $("day-tabs").addEventListener("click", event => {
      const button = event.target.closest("[data-day]");
      if (!button) return;
      selectedDay = button.dataset.day;
      renderDayTabs();
      renderSchedule();
    });

    $("task-list").addEventListener("click", event => {
      const toggleButton = event.target.closest("[data-toggle]");
      const editButton = event.target.closest("[data-edit]");
      const deleteButton = event.target.closest("[data-delete]");
      if (toggleButton) {
        toggleTaskDone(toggleButton.dataset.toggle);
        return;
      }
      if (editButton) { startTaskEdit(editButton.dataset.edit); return; }
      if (deleteButton) {
        const task = state.tasks.find(item => item.id === deleteButton.dataset.delete);
        if (task && confirm('Delete "' + task.title + '"?')) {
          state.tasks = state.tasks.filter(item => item.id !== task.id);
          if (timer.taskId === task.id && !timer.running) { timer.taskId = ""; resetTimer(); }
          if (editingTaskId === task.id) resetTaskForm();
          saveState(); renderAll(); toast("Task deleted.");
        }
      }
    });

    $("day-tasks").addEventListener("click", event => {
      const toggleButton = event.target.closest("[data-toggle]");
      if (toggleButton) toggleTaskDone(toggleButton.dataset.toggle);
    });

    $("task-search").addEventListener("input", renderTasks);
    $("task-filter-subject").addEventListener("change", renderTasks);
    $("task-filter-status").addEventListener("change", renderTasks);

    $("timer-task").addEventListener("change", () => {
      if (!timer.running) { timer.taskId = $("timer-task").value; }
    });
    $("timer-minutes").addEventListener("input", () => { if (!timer.running) resetTimer(); });
    $("timer-start").addEventListener("click", toggleTimer);
    $("timer-reset").addEventListener("click", () => { resetTimer(); toast("Timer reset."); });

    $("export-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "studyflow-backup-" + todayISO() + ".json";
      link.click();
      URL.revokeObjectURL(url);
      toast("Backup downloaded.");
    });
    $("import-input").addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state = normalize(JSON.parse(String(reader.result)));
          saveState(); renderAll(); toast("Backup imported.");
        } catch (error) { toast("That file is not a valid Studyflow backup."); }
        event.target.value = "";
      };
      reader.readAsText(file);
    });
    $("sample-btn").addEventListener("click", () => {
      state = sampleState();
      saveState(); renderAll(); toast("Sample plan loaded. Replace it with your own tasks anytime.");
    });
    $("clear-btn").addEventListener("click", () => {
      if (!confirm("Clear all subjects and tasks from this browser?")) return;
      state = emptyState();
      saveState(); renderAll(); toast("Everything cleared.");
    });

    const navToggle = document.querySelector(".nav-toggle");
    const nav = $("app-nav");
    if (navToggle && nav) {
      navToggle.addEventListener("click", () => {
        const open = nav.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(open));
        navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
      nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }));
    }
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    $("task-date").value = todayISO();
    $("week-start").value = mondayOf(todayISO());
    setupTheme();
    fillSubjectSelects();
    bindEvents();
    renderAll();
    resetTimer();
  });
})();
