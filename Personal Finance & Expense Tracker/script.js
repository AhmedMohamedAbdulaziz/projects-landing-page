/* Pennywise — working finance tracker. Data is saved in localStorage. */
(function () {
  "use strict";

  const STORAGE_KEY = "pennywise.app.v1";
  const EXPENSE_CATEGORIES = ["Groceries", "Transport", "Eating out", "Bills", "Shopping", "Health", "Entertainment", "Other"];
  const INCOME_CATEGORIES = ["Salary", "Freelance", "Gifts", "Other income"];
  const COLORS = {
    Groceries: "#0f7d61", Transport: "#2f80b6", "Eating out": "#c48117", Bills: "#7c63c7",
    Shopping: "#0e9a98", Health: "#b4473c", Entertainment: "#d07aa8", Other: "#8a959d",
    Salary: "#0f7d61", Freelance: "#2f80b6", Gifts: "#7c63c7", "Other income": "#8a959d"
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function todayISO() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }
  const currentMonth = () => todayISO().slice(0, 7);
  const monthOf = date => String(date || "").slice(0, 7);

  function formatMoney(value) {
    const amount = Number(value || 0);
    const sign = amount < 0 ? "-" : "";
    return sign + "$" + Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatCompact(value) {
    if (Math.abs(value) >= 1000) return "$" + (value / 1000).toFixed(1) + "k";
    return formatMoney(value);
  }
  function formatDate(value) {
    const date = new Date(String(value) + "T00:00:00");
    return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function formatMonth(value) {
    const date = new Date(String(value) + "-01T00:00:00");
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  function colorFor(category) { return COLORS[category] || "#8a959d"; }

  /* ---------- State ---------- */
  function emptyState() { return { entries: [], budgets: {}, goals: [], initialized: true }; }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") return emptyState();
    return {
      entries: Array.isArray(raw.entries) ? raw.entries.filter(e => e && typeof e === "object").map(e => ({
        id: String(e.id || uid()),
        type: e.type === "income" ? "income" : "expense",
        title: String(e.title || "Untitled"),
        amount: Number(e.amount) > 0 ? Number(e.amount) : 0,
        category: String(e.category || "Other"),
        date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO()
      })) : [],
      budgets: raw.budgets && typeof raw.budgets === "object" ? raw.budgets : {},
      goals: Array.isArray(raw.goals) ? raw.goals.filter(g => g && typeof g === "object").map(g => ({
        id: String(g.id || uid()),
        name: String(g.name || "Goal"),
        target: Number(g.target) > 0 ? Number(g.target) : 1,
        saved: Number(g.saved) >= 0 ? Number(g.saved) : 0
      })) : [],
      initialized: true
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch (error) {
      return emptyState();
    }
  }

  let state = loadState();
  let currentType = "expense";
  let editingId = null;
  let toastTimer = null;

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

  /* ---------- Sample data ---------- */
  function sampleState() {
    const month = currentMonth();
    const day = n => month + "-" + String(n).padStart(2, "0");
    return normalize({
      entries: [
        { id: uid(), type: "income", title: "Monthly salary", amount: 2800, category: "Salary", date: day(1) },
        { id: uid(), type: "income", title: "Freelance project", amount: 320, category: "Freelance", date: day(12) },
        { id: uid(), type: "expense", title: "Rent", amount: 920, category: "Bills", date: day(1) },
        { id: uid(), type: "expense", title: "Groceries", amount: 64.2, category: "Groceries", date: day(22) },
        { id: uid(), type: "expense", title: "City transit", amount: 28, category: "Transport", date: day(21) },
        { id: uid(), type: "expense", title: "Corner café", amount: 12.5, category: "Eating out", date: day(20) },
        { id: uid(), type: "expense", title: "New headphones", amount: 145, category: "Shopping", date: day(15) },
        { id: uid(), type: "expense", title: "Pharmacy", amount: 40, category: "Health", date: day(8) },
        { id: uid(), type: "expense", title: "Cinema", amount: 30, category: "Entertainment", date: day(18) }
      ],
      budgets: { Groceries: 400, Transport: 150, "Eating out": 150, Bills: 1000 },
      goals: [
        { id: uid(), name: "Emergency fund", target: 3000, saved: 1860 },
        { id: uid(), name: "New laptop", target: 1200, saved: 300 }
      ]
    });
  }

  /* ---------- Form setup ---------- */
  function fillSelect(select, values, includeAllLabel) {
    if (!select) return;
    const options = [];
    if (includeAllLabel) options.push('<option value="all">' + esc(includeAllLabel) + "</option>");
    values.forEach(value => options.push('<option value="' + esc(value) + '">' + esc(value) + "</option>"));
    select.innerHTML = options.join("");
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll(".type-btn").forEach(button => {
      const active = button.dataset.type === type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    fillSelect($("entry-category"), type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES);
    $("entry-submit").innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg> Add ' + type;
  }

  function resetEntryForm() {
    $("entry-form").reset();
    $("entry-date").value = todayISO();
    editingId = null;
    $("entry-mode-badge").textContent = "New entry";
    $("entry-submit").innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-plus"></use></svg> Add expense';
    $("entry-cancel").hidden = true;
    $("entry-error").hidden = true;
    $("entry-title").removeAttribute("aria-invalid");
    $("entry-amount").removeAttribute("aria-invalid");
    setType("expense");
  }

  function startEdit(id) {
    const entry = state.entries.find(item => item.id === id);
    if (!entry) return;
    editingId = id;
    setType(entry.type);
    $("entry-title").value = entry.title;
    $("entry-amount").value = entry.amount;
    $("entry-category").value = entry.category;
    $("entry-date").value = entry.date;
    $("entry-mode-badge").textContent = "Editing";
    $("entry-submit").innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg> Save changes';
    $("entry-cancel").hidden = false;
    $("add-entry").scrollIntoView({ behavior: "smooth", block: "start" });
    $("entry-title").focus({ preventScroll: true });
  }

  /* ---------- Rendering ---------- */
  function monthEntries() {
    const month = $("month-filter").value || currentMonth();
    return state.entries.filter(entry => monthOf(entry.date) === month);
  }

  function renderOverview() {
    const month = $("month-filter").value || currentMonth();
    const all = state.entries;
    const balance = all.reduce((sum, e) => sum + (e.type === "income" ? 1 : -1) * Number(e.amount || 0), 0);
    const inMonth = monthEntries();
    const income = inMonth.filter(e => e.type === "income");
    const expenses = inMonth.filter(e => e.type === "expense");
    const incomeTotal = income.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    $("overview-month-label").textContent = "Summary for " + formatMonth(month);
    $("stat-balance").textContent = formatMoney(balance);
    $("stat-income").textContent = formatMoney(incomeTotal);
    $("stat-expense").textContent = formatMoney(expenseTotal);
    $("stat-net").textContent = formatMoney(incomeTotal - expenseTotal);
    $("stat-income-count").textContent = income.length + (income.length === 1 ? " entry" : " entries");
    $("stat-expense-count").textContent = expenses.length + (expenses.length === 1 ? " entry" : " entries");

    const totals = {};
    expenses.forEach(entry => { totals[entry.category] = (totals[entry.category] || 0) + Number(entry.amount || 0); });
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, item) => sum + item[1], 0);
    const donut = $("category-donut");
    const legend = $("category-legend");

    if (!total) {
      donut.style.background = "conic-gradient(#e7ece8 0 100%)";
      $("donut-label").textContent = "—";
      $("chart-total").textContent = "No expenses in this month";
      legend.innerHTML = '<li class="empty-note">Add an expense to see your categories.</li>';
      return;
    }

    let cursor = 0;
    const stops = sorted.map(([category, amount]) => {
      const end = cursor + (amount / total) * 100;
      const stop = colorFor(category) + " " + cursor.toFixed(2) + "% " + end.toFixed(2) + "%";
      cursor = end;
      return stop;
    });
    donut.style.background = "conic-gradient(" + stops.join(",") + ")";
    donut.setAttribute("aria-label", "Spending by category for " + formatMonth(month));
    $("donut-label").textContent = formatCompact(total);
    $("chart-total").textContent = formatMoney(total) + " across " + sorted.length + (sorted.length === 1 ? " category" : " categories");
    legend.innerHTML = sorted.map(([category, amount]) =>
      '<li><i class="legend-dot" style="background:' + colorFor(category) + '"></i><span>' + esc(category) + '</span><strong>' + formatMoney(amount) + "</strong></li>"
    ).join("");
  }

  function renderBudgets() {
    const month = $("month-filter").value || currentMonth();
    const spent = {};
    monthEntries().filter(e => e.type === "expense").forEach(e => { spent[e.category] = (spent[e.category] || 0) + Number(e.amount || 0); });
    const categories = Object.keys(state.budgets).sort();
    const list = $("budget-list");

    if (!categories.length) {
      list.innerHTML = '<div class="empty-state">No budgets yet. Set a monthly limit above.</div>';
      return;
    }

    list.innerHTML = categories.map(category => {
      const limit = Number(state.budgets[category] || 0);
      const used = spent[category] || 0;
      const pct = limit > 0 ? (used / limit) * 100 : 0;
      const remaining = limit - used;
      return '<div class="budget-row">' +
        '<div class="budget-meta"><span>' + esc(category) + '</span><strong>' + formatMoney(used) + " / " + formatMoney(limit) + "</strong></div>" +
        '<div class="progress-track"><span class="' + (pct > 100 ? "over" : "") + '" style="--w:' + Math.min(pct, 100).toFixed(1) + '%"></span></div>' +
        '<div class="budget-foot"><span>' + pct.toFixed(0) + "% used</span><span>" + (remaining >= 0 ? formatMoney(remaining) + " left" : formatMoney(-remaining) + " over") + '</span></div>' +
        '<div class="row-actions" style="margin-top:10px;justify-content:flex-end"><button class="icon-btn" type="button" data-budget-delete="' + esc(category) + '" aria-label="Remove ' + esc(category) + ' budget"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg></button></div>' +
        "</div>";
    }).join("");
  }

  function renderGoals() {
    const list = $("goal-list");
    if (!state.goals.length) {
      list.innerHTML = '<div class="empty-state">No savings goals yet. Add one above.</div>';
      return;
    }
    list.innerHTML = state.goals.map(goal => {
      const target = Number(goal.target || 1);
      const saved = Number(goal.saved || 0);
      const pct = Math.min((saved / target) * 100, 100);
      return '<div class="goal-row">' +
        '<div class="goal-meta"><span>' + esc(goal.name) + '</span><strong>' + formatMoney(saved) + " / " + formatMoney(target) + "</strong></div>" +
        '<div class="progress-track"><span style="--w:' + pct.toFixed(1) + '%"></span></div>' +
        '<div class="goal-foot"><span>' + pct.toFixed(0) + "% complete</span><span>" + formatMoney(Math.max(target - saved, 0)) + " to go</span></div>" +
        '<div class="goal-contribute"><input type="number" min="0.01" step="0.01" placeholder="Amount to add" aria-label="Contribution to ' + esc(goal.name) + '" id="contribution-' + esc(goal.id) + '">' +
        '<button class="btn btn-primary" type="button" data-goal-add="' + esc(goal.id) + '">Add</button>' +
        '<button class="icon-btn" type="button" data-goal-delete="' + esc(goal.id) + '" aria-label="Delete ' + esc(goal.name) + '"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg></button></div>' +
        "</div>";
    }).join("");
  }

  function renderTransactions() {
    const search = $("search-input").value.trim().toLowerCase();
    const type = $("filter-type").value;
    const category = $("filter-category").value;
    const month = $("month-filter").value || currentMonth();
    const entries = monthEntries().filter(entry => {
      if (type !== "all" && entry.type !== type) return false;
      if (category !== "all" && entry.category !== category) return false;
      if (search && !((entry.title + " " + entry.category).toLowerCase().includes(search))) return false;
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    $("transaction-count").textContent = entries.length + (entries.length === 1 ? " entry" : " entries") + " in " + formatMonth(month);
    const list = $("transaction-list");
    if (!entries.length) {
      list.innerHTML = '<div class="empty-state">Nothing matches these filters for this month.</div>';
      return;
    }
    list.innerHTML = '<div class="tx-head"><span>Date</span><span>Description</span><span>Type</span><span>Amount</span><span>Actions</span></div>' +
      entries.map(entry => {
        const isIncome = entry.type === "income";
        return '<div class="tx-row">' +
          "<span>" + esc(formatDate(entry.date)) + "</span>" +
          '<span class="tx-title">' + esc(entry.title) + "<small>" + esc(entry.category) + "</small></span>" +
          '<span class="tx-cat"><i style="background:' + colorFor(entry.category) + '"></i>' + (isIncome ? "Income" : "Expense") + "</span>" +
          '<span class="tx-amount ' + entry.type + '">' + (isIncome ? "+" : "−") + formatMoney(entry.amount) + "</span>" +
          '<span class="row-actions"><button class="icon-btn" type="button" data-edit="' + esc(entry.id) + '" aria-label="Edit ' + esc(entry.title) + '"><svg class="icon" aria-hidden="true"><use href="#i-edit"></use></svg></button>' +
          '<button class="icon-btn" type="button" data-delete="' + esc(entry.id) + '" aria-label="Delete ' + esc(entry.title) + '"><svg class="icon" aria-hidden="true"><use href="#i-trash"></use></svg></button></span>' +
          "</div>";
      }).join("");
  }

  function renderAll() {
    renderOverview();
    renderBudgets();
    renderGoals();
    renderTransactions();
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    document.querySelectorAll(".type-btn").forEach(button => {
      button.addEventListener("click", () => setType(button.dataset.type));
    });

    $("entry-form").addEventListener("submit", event => {
      event.preventDefault();
      const title = $("entry-title").value.trim();
      const amount = Number($("entry-amount").value);
      const category = $("entry-category").value;
      const date = $("entry-date").value;
      const error = $("entry-error");

      if (!title) {
        error.textContent = "Add a short description.";
        error.hidden = false;
        $("entry-title").setAttribute("aria-invalid", "true");
        $("entry-title").focus();
        return;
      }
      if (!(amount > 0)) {
        error.textContent = "Enter an amount greater than zero.";
        error.hidden = false;
        $("entry-amount").setAttribute("aria-invalid", "true");
        $("entry-amount").focus();
        return;
      }
      if (!date) {
        error.textContent = "Choose a date.";
        error.hidden = false;
        return;
      }

      error.hidden = true;
      $("entry-title").removeAttribute("aria-invalid");
      $("entry-amount").removeAttribute("aria-invalid");

      if (editingId) {
        const entry = state.entries.find(item => item.id === editingId);
        if (entry) Object.assign(entry, { title, amount, category, date, type: currentType });
        toast("Entry updated.");
      } else {
        state.entries.push({ id: uid(), type: currentType, title, amount, category, date });
        toast(currentType === "income" ? "Income added." : "Expense added.");
      }
      saveState();
      resetEntryForm();
      renderAll();
    });

    $("entry-cancel").addEventListener("click", () => { resetEntryForm(); toast("Edit cancelled."); });
    $("entry-title").addEventListener("input", () => { $("entry-error").hidden = true; $("entry-title").removeAttribute("aria-invalid"); });
    $("entry-amount").addEventListener("input", () => { $("entry-error").hidden = true; $("entry-amount").removeAttribute("aria-invalid"); });

    $("month-filter").addEventListener("change", renderAll);
    $("search-input").addEventListener("input", renderTransactions);
    $("filter-type").addEventListener("change", renderTransactions);
    $("filter-category").addEventListener("change", renderTransactions);

    $("transaction-list").addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit]");
      const deleteButton = event.target.closest("[data-delete]");
      if (editButton) { startEdit(editButton.dataset.edit); return; }
      if (deleteButton) {
        const entry = state.entries.find(item => item.id === deleteButton.dataset.delete);
        if (entry && confirm('Delete "' + entry.title + '"?')) {
          state.entries = state.entries.filter(item => item.id !== entry.id);
          if (editingId === entry.id) resetEntryForm();
          saveState(); renderAll(); toast("Entry deleted.");
        }
      }
    });

    $("budget-form").addEventListener("submit", event => {
      event.preventDefault();
      const category = $("budget-category").value;
      const amount = Number($("budget-amount").value);
      if (!(amount > 0)) { toast("Enter a limit greater than zero."); return; }
      state.budgets[category] = amount;
      $("budget-amount").value = "";
      saveState(); renderBudgets(); toast("Budget saved for " + category + ".");
    });

    $("budget-list").addEventListener("click", event => {
      const button = event.target.closest("[data-budget-delete]");
      if (!button) return;
      delete state.budgets[button.dataset.budgetDelete];
      saveState(); renderBudgets(); toast("Budget removed.");
    });

    $("goal-form").addEventListener("submit", event => {
      event.preventDefault();
      const name = $("goal-name").value.trim();
      const target = Number($("goal-target").value);
      if (!name || !(target > 0)) { toast("Add a goal name and a target greater than zero."); return; }
      state.goals.push({ id: uid(), name, target, saved: 0 });
      $("goal-name").value = ""; $("goal-target").value = "";
      saveState(); renderGoals(); toast("Goal added.");
    });

    $("goal-list").addEventListener("click", event => {
      const addButton = event.target.closest("[data-goal-add]");
      const deleteButton = event.target.closest("[data-goal-delete]");
      if (addButton) {
        const goal = state.goals.find(item => item.id === addButton.dataset.goalAdd);
        const input = $("contribution-" + addButton.dataset.goalAdd);
        const amount = Number(input && input.value);
        if (!goal || !(amount > 0)) { toast("Enter an amount to add."); return; }
        goal.saved = Number(goal.saved || 0) + amount;
        saveState(); renderGoals(); toast("Added " + formatMoney(amount) + " to " + goal.name + ".");
      }
      if (deleteButton) {
        const goal = state.goals.find(item => item.id === deleteButton.dataset.goalDelete);
        if (goal && confirm('Delete goal "' + goal.name + '"?')) {
          state.goals = state.goals.filter(item => item.id !== goal.id);
          saveState(); renderGoals(); toast("Goal deleted.");
        }
      }
    });

    $("export-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pennywise-backup-" + todayISO() + ".json";
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
        } catch (error) {
          toast("That file is not a valid Pennywise backup.");
        }
        event.target.value = "";
      };
      reader.readAsText(file);
    });

    $("sample-btn").addEventListener("click", () => {
      state = sampleState();
      saveState(); renderAll(); toast("Sample data loaded. Replace it with your own entries anytime.");
    });

    $("clear-btn").addEventListener("click", () => {
      if (!confirm("Clear all entries, budgets, and goals from this browser?")) return;
      state = emptyState();
      saveState(); renderAll(); toast("Everything cleared.");
    });

    const toggle = document.querySelector(".nav-toggle");
    const nav = $("app-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        const open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
      nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }));
    }
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    $("entry-date").value = todayISO();
    $("month-filter").value = currentMonth();
    fillSelect($("entry-category"), EXPENSE_CATEGORIES);
    fillSelect($("budget-category"), EXPENSE_CATEGORIES);
    fillSelect($("filter-category"), Array.from(new Set(EXPENSE_CATEGORIES.concat(INCOME_CATEGORIES))), "All categories");
    setType("expense");
    bindEvents();
    renderAll();
  });
})();
