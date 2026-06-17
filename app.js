/* ===========================================================
   Javi's Finance — app.js
   Vanilla JS. All data lives in localStorage. No backend.
   Sections: State/Storage · Helpers · Defaults · Rendering ·
             Calculations · Forms/Modals · Navigation · Export/Import · Init
   =========================================================== */

"use strict";

/* -----------------------------------------------------------
   1. CONSTANTS & DEFAULTS
   ----------------------------------------------------------- */
const STORAGE_KEY = "javisFinance.v1";
const APP_VERSION = "1.0.0";

const DEFAULT_EXPENSE_CATEGORIES = [
  "Food", "Fuel", "Gym", "Subscriptions", "Car", "Health",
  "Entertainment", "Family", "Work", "Learning", "Other"
];
const DEFAULT_INCOME_CATEGORIES = ["Salary", "Extra income", "Refund", "Other"];

function defaultData() {
  const now = new Date().toISOString();
  return {
    settings: {
      currency: "$",
      currencyCode: "MXN",
      biweeklyIncome: 9250,
      monthlyIncome: 18500,
      incomeFrequency: "biweekly",
      savingsGoalPct: 20,
      spendingLimitPct: 80,
      monthlyBudget: 14800,
      firstDayOfMonth: 1,
      theme: "system",
      expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
      incomeCategories: [...DEFAULT_INCOME_CATEGORIES]
    },
    transactions: [],
    subscriptions: [
      sub("Gym", 670, "monthly", "Gym", "essential"),
      sub("Bevel", 129, "monthly", "Subscriptions", "useful"),
      sub("iCloud", 49, "monthly", "Subscriptions", "useful")
    ],
    budgets: [
      budget("Monthly spending", "", 14800, 80),
      budget("Savings target", "__savings__", 3700, 100)
    ],
    purchaseDecisions: [],
    metadata: { version: APP_VERSION, createdAt: now, updatedAt: now }
  };
}

// Small builders used only for seeding defaults.
function sub(name, cost, frequency, category, importance) {
  return {
    id: uid(), name, monthlyCost: cost, frequency,
    nextRenewal: "", category, importance, active: true, notes: ""
  };
}
function budget(name, category, amount, alert) {
  return {
    id: uid(), name, category, amount, period: "monthly",
    alertThreshold: alert, active: true, notes: ""
  };
}

/* -----------------------------------------------------------
   2. STATE & STORAGE
   ----------------------------------------------------------- */
let state = null;
// The month the dashboard/reports are focused on (YYYY-MM).
let viewMonth = monthKey(new Date());

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = defaultData();
      saveData();
    } else {
      state = migrate(JSON.parse(raw));
    }
  } catch (err) {
    console.error("Failed to load data, starting fresh.", err);
    state = defaultData();
  }
}

function saveData() {
  state.metadata.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Ensure imported/older data has all expected keys.
function migrate(data) {
  const base = defaultData();
  const merged = Object.assign({}, base, data);
  merged.settings = Object.assign({}, base.settings, data.settings || {});
  merged.metadata = Object.assign({}, base.metadata, data.metadata || {});
  ["transactions", "subscriptions", "budgets", "purchaseDecisions"].forEach((k) => {
    if (!Array.isArray(merged[k])) merged[k] = [];
  });
  return merged;
}

/* -----------------------------------------------------------
   3. HELPERS
   ----------------------------------------------------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function todayISO() { return new Date().toISOString().slice(0, 10); }

// "YYYY-MM" for a Date object.
function monthKey(d) {
  return d.toISOString().slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function inMonth(isoDate, key) {
  return typeof isoDate === "string" && isoDate.slice(0, 7) === key;
}

function fmtMoney(n) {
  const sym = state.settings.currency || "$";
  const value = Number(n || 0);
  return sym + value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  return (Math.round(Number(n || 0) * 10) / 10) + "%";
}

function clampPct(n) { return Math.max(0, Math.min(100, Number(n || 0))); }

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

// Number of days in the view month that have elapsed (for daily average).
function daysElapsedInMonth(key) {
  const today = new Date();
  if (key === monthKey(today)) return today.getDate();
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate(); // last day of that month
}

/* -----------------------------------------------------------
   4. CALCULATIONS
   ----------------------------------------------------------- */

// Monthly income depends on the configured frequency.
function getMonthlyIncomeSetting() {
  const s = state.settings;
  if (s.incomeFrequency === "biweekly") {
    // 2 paychecks per month (quincenal).
    return Number(s.biweeklyIncome || 0) * 2 || Number(s.monthlyIncome || 0);
  }
  return Number(s.monthlyIncome || 0);
}

// Normalize a subscription cost to a monthly figure.
function subMonthlyCost(s) {
  const c = Number(s.monthlyCost || 0);
  switch (s.frequency) {
    case "yearly": return c / 12;
    case "biweekly": return c * 2;
    case "weekly": return c * 52 / 12;
    default: return c; // monthly
  }
}

function calculateSubscriptionImpact() {
  const active = state.subscriptions.filter((s) => s.active);
  const monthly = active.reduce((sum, s) => sum + subMonthlyCost(s), 0);
  const income = getMonthlyIncomeSetting();
  const optional = active
    .filter((s) => s.importance === "optional")
    .reduce((sum, s) => sum + subMonthlyCost(s), 0);
  let mostExpensive = null;
  active.forEach((s) => {
    if (!mostExpensive || subMonthlyCost(s) > subMonthlyCost(mostExpensive)) mostExpensive = s;
  });
  return {
    monthly,
    yearly: monthly * 12,
    pctOfIncome: income > 0 ? (monthly / income) * 100 : 0,
    optional,
    mostExpensive,
    suggestions: active.filter((s) => s.importance === "optional")
  };
}

// Core monthly summary used by dashboard and reports.
function calculateMonthlySummary(key) {
  const txns = state.transactions.filter((t) => inMonth(t.date, key));
  const expenses = txns.filter((t) => t.type === "expense");
  const incomes = txns.filter((t) => t.type === "income");

  const totalSpent = expenses.reduce((s, t) => s + Number(t.amount), 0);
  const txnIncome = incomes.reduce((s, t) => s + Number(t.amount), 0);
  // Use the larger of recorded income or the configured expected income.
  const expectedIncome = getMonthlyIncomeSetting();
  const income = Math.max(txnIncome, expectedIncome);

  const remaining = income - totalSpent;
  const savings = income - totalSpent;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  const days = daysElapsedInMonth(key);
  const dailyAvg = days > 0 ? totalSpent / days : 0;

  const byCategory = {};
  expenses.forEach((t) => {
    byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
  });

  const byNecessity = { essential: 0, useful: 0, unnecessary: 0 };
  expenses.forEach((t) => {
    const n = t.necessity || "useful";
    byNecessity[n] = (byNecessity[n] || 0) + Number(t.amount);
  });

  return {
    key, txns, expenses, incomes,
    totalSpent, income, txnIncome, expectedIncome,
    remaining, savings, savingsRate, dailyAvg,
    byCategory, byNecessity,
    unnecessary: byNecessity.unnecessary || 0,
    optional: (byNecessity.unnecessary || 0) + (byNecessity.useful || 0)
  };
}

// No-spend streak counting back from today (only meaningful for current month onward).
function calculateNoSpendStreak() {
  const spendDays = new Set(
    state.transactions
      .filter((t) => t.type === "expense" && Number(t.amount) > 0)
      .map((t) => t.date)
  );
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 366; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (spendDays.has(iso)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Actual spending attributed to a single budget for the view month.
function budgetActual(b, summary) {
  if (b.category === "__savings__") return summary.savings; // savings budget tracks saved amount
  if (!b.category) return summary.totalSpent;               // overall budget
  return summary.byCategory[b.category] || 0;               // category budget
}

function calculateBudgetStatus(b, summary) {
  const actual = budgetActual(b, summary);
  const amount = Number(b.amount || 0);

  if (b.category === "__savings__") {
    const pct = amount > 0 ? (actual / amount) * 100 : 0;
    return {
      actual, amount, isSavings: true,
      pct, remaining: amount - actual,
      over: 0,
      status: actual >= amount ? "green" : pct >= 50 ? "yellow" : "red"
    };
  }

  const pct = amount > 0 ? (actual / amount) * 100 : 0;
  const remaining = amount - actual;
  const over = actual > amount ? actual - amount : 0;
  const threshold = Number(b.alertThreshold || 80);
  let status = "green";
  if (pct >= 100) status = "red";
  else if (pct >= threshold) status = "yellow";
  return { actual, amount, isSavings: false, pct, remaining, over, status, threshold };
}

// Discretionary budget remaining = overall budget minus this month's spend.
function discretionaryRemaining(summary) {
  const overall = state.budgets.find((b) => b.active && !b.category && b.category !== "__savings__");
  const budgetAmount = overall ? Number(overall.amount) : Number(state.settings.monthlyBudget || 0);
  return budgetAmount - summary.totalSpent;
}

/* -----------------------------------------------------------
   5. PURCHASE DECISION LOGIC
   ----------------------------------------------------------- */
function evaluatePurchaseDecision(input) {
  const summary = calculateMonthlySummary(viewMonth);
  const remainingDiscretionary = discretionaryRemaining(summary);
  const cost = Number(input.cost || 0);

  // Order matters — first match wins (mirrors the spec).
  if (!input.necessary && input.freeAlt) {
    return { verdict: "Do not buy", cls: "no",
      reason: "There is a free alternative and it isn't necessary." };
  }
  if (!input.necessary && input.canWait) {
    return { verdict: "Wait 7 days", cls: "wait",
      reason: "It can wait — give it 7 days and see if you still want it." };
  }
  if (cost > remainingDiscretionary) {
    return { verdict: "Do not buy", cls: "no",
      reason: `Cost exceeds your remaining budget (${fmtMoney(remainingDiscretionary)} left).` };
  }
  if (input.supports && cost <= remainingDiscretionary) {
    return { verdict: "Allowed if within budget", cls: "buy",
      reason: "Supports health, work, or family and fits your budget." };
  }
  if (input.necessary) {
    return { verdict: "Necessary purchase", cls: "buy",
      reason: "Marked as necessary — go ahead." };
  }
  return { verdict: "Allowed if within budget", cls: "buy",
    reason: "Fits within your remaining budget." };
}

/* -----------------------------------------------------------
   6. RENDERING — DASHBOARD
   ----------------------------------------------------------- */
function setBar(id, pct, label, lblId) {
  const fill = $("#" + id);
  const p = clampPct(pct);
  fill.style.width = p + "%";
  fill.classList.remove("warn", "danger", "info");
  if (id === "barSavingsGoal") fill.classList.add("info");
  else if (pct >= 100) fill.classList.add("danger");
  else if (pct >= 80) fill.classList.add("warn");
  if (lblId) $("#" + lblId).textContent = label;
}

function renderDashboard() {
  const s = calculateMonthlySummary(viewMonth);
  const subs = calculateSubscriptionImpact();
  const income = s.income;

  $("#dashIncome").textContent = fmtMoney(income);
  $("#dashSpent").textContent = fmtMoney(s.totalSpent);
  $("#dashRemaining").textContent = fmtMoney(s.remaining);
  $("#dashSavings").textContent = fmtMoney(s.savings);
  $("#dashSavingsRate").textContent = fmtPct(s.savingsRate);
  $("#dashDailyAvg").textContent = fmtMoney(s.dailyAvg);
  $("#dashStreak").textContent = calculateNoSpendStreak() + " d";
  $("#dashSubsTotal").textContent = fmtMoney(subs.monthly);
  $("#dashSubsPct").textContent = fmtPct(subs.pctOfIncome);

  // Budget utilization (overall budget).
  const overall = state.budgets.find((b) => b.active && !b.category);
  const budgetAmt = overall ? Number(overall.amount) : Number(state.settings.monthlyBudget || 0);
  const budgetPct = budgetAmt > 0 ? (s.totalSpent / budgetAmt) * 100 : 0;
  $("#dashBudgetPct").textContent = fmtPct(budgetPct);

  // Progress bars.
  const spendIncomePct = income > 0 ? (s.totalSpent / income) * 100 : 0;
  setBar("barSpendIncome", spendIncomePct, fmtPct(spendIncomePct), "lblSpendIncome");
  setBar("barSpendBudget", budgetPct, fmtPct(budgetPct), "lblSpendBudget");
  setBar("barSubsIncome", subs.pctOfIncome, fmtPct(subs.pctOfIncome), "lblSubsIncome");

  const savingsGoalAmt = income * (Number(state.settings.savingsGoalPct) / 100);
  const savingsGoalPct = savingsGoalAmt > 0 ? (s.savings / savingsGoalAmt) * 100 : 0;
  setBar("barSavingsGoal", savingsGoalPct, fmtPct(savingsGoalPct), "lblSavingsGoal");

  // Status badge logic (based on spending vs spending limit).
  const limitPct = Number(state.settings.spendingLimitPct || 80);
  const badge = $("#statusBadge");
  const msg = $("#statusMessage");
  badge.classList.remove("green", "yellow", "red");
  if (spendIncomePct < limitPct - 10) {
    badge.classList.add("green"); badge.textContent = "On track";
    msg.textContent = "Good discipline: spending is below target.";
  } else if (spendIncomePct <= limitPct) {
    badge.classList.add("yellow"); badge.textContent = "Watch it";
    msg.textContent = "You are getting close to your monthly limit.";
  } else {
    badge.classList.add("red"); badge.textContent = "Over limit";
    msg.textContent = "Spending is above your target this month.";
  }
}

/* -----------------------------------------------------------
   7. RENDERING — TRANSACTIONS
   ----------------------------------------------------------- */
function getFilteredTransactions() {
  const term = $("#txnSearch").value.trim().toLowerCase();
  const cat = $("#txnFilterCategory").value;
  const type = $("#txnFilterType").value;
  const sort = $("#txnSort").value;

  let list = state.transactions.filter((t) => inMonth(t.date, viewMonth));
  if (term) list = list.filter((t) => (t.description || "").toLowerCase().includes(term));
  if (cat) list = list.filter((t) => t.category === cat);
  if (type) list = list.filter((t) => t.type === type);

  list.sort((a, b) => {
    switch (sort) {
      case "date-asc": return a.date.localeCompare(b.date);
      case "amount-desc": return b.amount - a.amount;
      case "amount-asc": return a.amount - b.amount;
      default: return b.date.localeCompare(a.date);
    }
  });
  return list;
}

function renderTransactions() {
  const list = getFilteredTransactions();
  const root = $("#txnList");
  if (!list.length) {
    root.innerHTML = `<div class="empty">No transactions for this month yet.<br>Add one with the button above.</div>`;
    return;
  }
  root.innerHTML = list.map((t) => {
    const isExp = t.type === "expense";
    const sign = isExp ? "−" : "+";
    return `
      <div class="list-item">
        <div class="list-item__main">
          <span class="list-item__title">${escapeHtml(t.description || t.category)}</span>
          <span class="list-item__sub">${t.date} · ${escapeHtml(t.category)}
            <span class="tag ${t.necessity || ""}">${t.necessity || t.type}</span></span>
        </div>
        <div style="text-align:right">
          <div class="list-item__amount ${isExp ? "amount-expense" : "amount-income"}">${sign}${fmtMoney(t.amount)}</div>
          <div class="list-item__actions">
            <button class="icon-btn" data-edit-txn="${t.id}">✎</button>
            <button class="icon-btn" data-del-txn="${t.id}">🗑</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* -----------------------------------------------------------
   8. RENDERING — SUBSCRIPTIONS
   ----------------------------------------------------------- */
function renderSubscriptions() {
  const impact = calculateSubscriptionImpact();
  $("#subMonthly").textContent = fmtMoney(impact.monthly);
  $("#subYearly").textContent = fmtMoney(impact.yearly);
  $("#subPct").textContent = fmtPct(impact.pctOfIncome);
  $("#subOptional").textContent = fmtMoney(impact.optional);

  $("#subMostExpensive").textContent = impact.mostExpensive
    ? `${impact.mostExpensive.name} — ${fmtMoney(subMonthlyCost(impact.mostExpensive))}/mo`
    : "No active subscriptions.";

  const sugg = $("#subSuggestions");
  if (impact.pctOfIncome > 10) {
    sugg.innerHTML = `<div class="alert yellow">Subscriptions are taking ${fmtPct(impact.pctOfIncome)} of your income. Consider reviewing optional ones.</div>`;
  } else if (impact.suggestions.length) {
    sugg.innerHTML = `<div class="alert yellow">Review optional: ${impact.suggestions.map((s) => escapeHtml(s.name)).join(", ")}.</div>`;
  } else {
    sugg.innerHTML = `<div class="alert green">Subscription load looks healthy.</div>`;
  }

  const root = $("#subList");
  if (!state.subscriptions.length) {
    root.innerHTML = `<div class="empty">No subscriptions tracked.</div>`;
    return;
  }
  root.innerHTML = state.subscriptions.map((s) => `
    <div class="list-item">
      <div class="list-item__main">
        <span class="list-item__title">${escapeHtml(s.name)}
          ${s.active ? "" : '<span class="tag inactive">paused</span>'}</span>
        <span class="list-item__sub">${escapeHtml(s.category)} · ${s.frequency}
          <span class="tag ${s.importance}">${s.importance}</span>
          ${s.nextRenewal ? "· renews " + s.nextRenewal : ""}</span>
      </div>
      <div style="text-align:right">
        <div class="list-item__amount">${fmtMoney(subMonthlyCost(s))}/mo</div>
        <div class="list-item__actions">
          <button class="icon-btn" data-edit-sub="${s.id}">✎</button>
          <button class="icon-btn" data-del-sub="${s.id}">🗑</button>
        </div>
      </div>
    </div>`).join("");
}

/* -----------------------------------------------------------
   9. RENDERING — PURCHASE DECISIONS
   ----------------------------------------------------------- */
function renderDecisions() {
  const decs = state.purchaseDecisions;
  const rejected = decs.filter((d) => d.verdict === "Do not buy");
  const delayed = decs.filter((d) => d.verdict === "Wait 7 days");
  const unnecessaryAvoided = decs.filter((d) => !d.necessary && d.verdict !== "Necessary purchase"
    && d.verdict !== "Allowed if within budget");

  $("#decAvoided").textContent = fmtMoney(rejected.reduce((s, d) => s + Number(d.cost), 0));
  $("#decDelayed").textContent = fmtMoney(delayed.reduce((s, d) => s + Number(d.cost), 0));
  $("#decCount").textContent = unnecessaryAvoided.length;

  const root = $("#decList");
  if (!decs.length) {
    root.innerHTML = `<div class="empty">No decisions yet. Use the form above before your next purchase.</div>`;
    return;
  }
  root.innerHTML = decs.slice().reverse().map((d) => {
    const cls = d.verdict.includes("Do not") ? "no" : d.verdict.includes("Wait") ? "wait" : "buy";
    return `
      <div class="list-item">
        <div class="list-item__main">
          <span class="list-item__title">${escapeHtml(d.name)}</span>
          <span class="list-item__sub">${d.date} · ${escapeHtml(d.category)}
            <span class="tag ${cls === "no" ? "unnecessary" : cls === "wait" ? "useful" : "essential"}">${escapeHtml(d.verdict)}</span></span>
        </div>
        <div style="text-align:right">
          <div class="list-item__amount">${fmtMoney(d.cost)}</div>
          <div class="list-item__actions">
            <button class="icon-btn" data-del-dec="${d.id}">🗑</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* -----------------------------------------------------------
   10. RENDERING — BUDGET
   ----------------------------------------------------------- */
function renderBudget() {
  const summary = calculateMonthlySummary(viewMonth);
  const alerts = [];
  const root = $("#budgetList");

  const active = state.budgets.filter((b) => b.active);
  if (!active.length) {
    root.innerHTML = `<div class="empty">No budgets yet. Add one to start tracking.</div>`;
    $("#budgetAlerts").innerHTML = "";
    return;
  }

  root.innerHTML = active.map((b) => {
    const st = calculateBudgetStatus(b, summary);
    const barCls = st.status === "red" ? "danger" : st.status === "yellow" ? "warn" : (st.isSavings ? "info" : "");
    const pctText = fmtPct(st.pct);

    // Build alerts.
    if (st.isSavings) {
      if (st.actual >= st.amount) alerts.push(["green", `You are on track to meet your savings goal.`]);
      else alerts.push(["yellow", `Savings: ${fmtMoney(st.actual)} of ${fmtMoney(st.amount)} (${pctText}).`]);
    } else if (st.over > 0) {
      alerts.push(["red", `${b.name} exceeded by ${fmtMoney(st.over)}.`]);
    } else if (st.pct >= (st.threshold || 80)) {
      alerts.push(["yellow", `${b.name} is ${pctText} used.`]);
    }

    const label = st.isSavings
      ? `Saved ${fmtMoney(st.actual)} / ${fmtMoney(st.amount)}`
      : `${fmtMoney(st.actual)} / ${fmtMoney(st.amount)} · ${st.over > 0 ? "over " + fmtMoney(st.over) : fmtMoney(st.remaining) + " left"}`;

    return `
      <div class="card budget-item">
        <div class="budget-item__head">
          <span class="budget-item__name">${escapeHtml(b.name)}
            <span class="status-badge ${st.status}">${pctText}</span></span>
          <span class="list-item__actions">
            <button class="icon-btn" data-edit-budget="${b.id}">✎</button>
            <button class="icon-btn" data-del-budget="${b.id}">🗑</button>
          </span>
        </div>
        <div class="bar"><div class="bar__fill ${barCls}" style="width:${clampPct(st.pct)}%"></div></div>
        <span class="budget-item__nums">${label}</span>
      </div>`;
  }).join("");

  if (!alerts.length) alerts.push(["green", "Great job staying within budget."]);
  $("#budgetAlerts").innerHTML = alerts
    .map(([cls, msg]) => `<div class="alert ${cls}">${escapeHtml(msg)}</div>`).join("");
}

/* -----------------------------------------------------------
   11. RENDERING — REPORTS
   ----------------------------------------------------------- */
function renderReports() {
  const s = calculateMonthlySummary(viewMonth);
  const subs = calculateSubscriptionImpact();

  $("#repIncome").textContent = fmtMoney(s.income);
  $("#repExpenses").textContent = fmtMoney(s.totalSpent);
  $("#repNet").textContent = fmtMoney(s.savings);
  $("#repRate").textContent = fmtPct(s.savingsRate);

  // Budget performance text.
  const overall = state.budgets.find((b) => b.active && !b.category);
  if (overall) {
    const st = calculateBudgetStatus(overall, s);
    $("#repBudget").textContent =
      `Used ${fmtMoney(st.actual)} of ${fmtMoney(st.amount)} (${fmtPct(st.pct)}). ` +
      (st.over > 0 ? `Over budget by ${fmtMoney(st.over)}.` : `Variance: ${fmtMoney(st.remaining)} under budget.`);
  } else {
    $("#repBudget").textContent = "No overall budget configured.";
  }

  // Category chart.
  renderBarChart("#repCategoryChart", s.byCategory, s.totalSpent);

  // Necessity chart.
  renderBarChart("#repNecessityChart", {
    Essential: s.byNecessity.essential,
    Useful: s.byNecessity.useful,
    Unnecessary: s.byNecessity.unnecessary
  }, s.totalSpent);

  // Top 5 expenses.
  const top = s.expenses.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  $("#repTopList").innerHTML = top.length
    ? top.map((t) => `<div class="list-item">
        <div class="list-item__main">
          <span class="list-item__title">${escapeHtml(t.description || t.category)}</span>
          <span class="list-item__sub">${t.date} · ${escapeHtml(t.category)}</span>
        </div>
        <div class="list-item__amount amount-expense">${fmtMoney(t.amount)}</div></div>`).join("")
    : `<div class="empty">No expenses this month.</div>`;

  // Narrative summary.
  const topCat = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])[0];
  const overallSt = overall ? calculateBudgetStatus(overall, s) : null;
  const pctIncome = s.income > 0 ? (s.totalSpent / s.income) * 100 : 0;
  let focus = "keep up the discipline";
  if (subs.pctOfIncome > 10) focus = "review subscriptions";
  else if ((s.byNecessity.unnecessary || 0) > 0) focus = "reduce unnecessary spending";
  else if (overallSt && overallSt.over > 0) focus = "rein in overall spending";

  $("#reportSummary").textContent =
    `During ${monthLabel(viewMonth)}, total spending was ${fmtMoney(s.totalSpent)}, ` +
    `representing ${fmtPct(pctIncome)} of monthly income. ` +
    (topCat ? `The largest category was ${topCat[0]} (${fmtMoney(topCat[1])}). ` : "") +
    `Optional spending was ${fmtMoney(s.optional)}. ` +
    (overallSt ? `Budget utilization was ${fmtPct(overallSt.pct)}. ` : "") +
    `Suggested focus: ${focus}.`;
}

function renderBarChart(sel, dataObj, total) {
  const root = $(sel);
  const entries = Object.entries(dataObj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { root.innerHTML = `<div class="empty">No data.</div>`; return; }
  root.innerHTML = entries.map(([k, v]) => {
    const pct = total > 0 ? (v / total) * 100 : 0;
    return `<div class="chart-row">
      <div class="chart-row__top"><span>${escapeHtml(k)}</span><span>${fmtMoney(v)} · ${fmtPct(pct)}</span></div>
      <div class="chart-row__bar"><div class="chart-row__fill" style="width:${clampPct(pct)}%"></div></div>
    </div>`;
  }).join("");
}

/* -----------------------------------------------------------
   12. MASTER RENDER + NAV
   ----------------------------------------------------------- */
const SCREEN_TITLES = {
  dashboard: "Dashboard", transactions: "Transactions", subscriptions: "Subscriptions",
  decision: "Purchase Decision", budget: "Budget", reports: "Reports", settings: "Settings"
};

function renderAll() {
  $("#currentMonthLabel").textContent = monthLabel(viewMonth);
  renderDashboard();
  renderTransactions();
  renderSubscriptions();
  renderDecisions();
  renderBudget();
  renderReports();
}

function showScreen(name) {
  $all(".screen").forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
  $all(".nav-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.nav === name));
  $("#screenTitle").textContent = SCREEN_TITLES[name] || "Javi's Finance";
  window.scrollTo(0, 0);
}

/* -----------------------------------------------------------
   13. CATEGORY SELECTS
   ----------------------------------------------------------- */
function fillCategorySelects() {
  const exp = state.settings.expenseCategories;
  const inc = state.settings.incomeCategories;

  $("#qaCategory").innerHTML = exp.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
  $("#decCategory").innerHTML = exp.map((c) => `<option>${escapeHtml(c)}</option>`).join("");

  const all = [...new Set([...exp, ...inc])];
  $("#txnFilterCategory").innerHTML = `<option value="">All</option>` +
    all.map((c) => `<option>${escapeHtml(c)}</option>`).join("");
}

/* -----------------------------------------------------------
   14. MODAL HELPERS
   ----------------------------------------------------------- */
function openModal(title, bodyHtml) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = bodyHtml;
  $("#modalBackdrop").classList.remove("hidden");
}
function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  $("#modalBody").innerHTML = "";
}

function optionList(items, selected) {
  return items.map((c) => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

/* -----------------------------------------------------------
   15. TRANSACTION FORM (add / edit)
   ----------------------------------------------------------- */
function openTransactionModal(existing) {
  const t = existing || { type: "expense", date: todayISO(), necessity: "useful", paymentMethod: "debit" };
  const cats = t.type === "income" ? state.settings.incomeCategories : state.settings.expenseCategories;

  openModal(existing ? "Edit transaction" : "Add transaction", `
    <form id="txnForm" class="form">
      <div class="form-row">
        <label>Type
          <select id="tfType">
            <option value="expense" ${t.type === "expense" ? "selected" : ""}>Expense</option>
            <option value="income" ${t.type === "income" ? "selected" : ""}>Income</option>
          </select>
        </label>
        <label>Amount<input type="number" step="0.01" min="0" id="tfAmount" value="${t.amount ?? ""}" required></label>
      </div>
      <div class="form-row">
        <label>Date<input type="date" id="tfDate" value="${t.date}" required></label>
        <label>Category<select id="tfCategory">${optionList(cats, t.category)}</select></label>
      </div>
      <label>Description<input type="text" id="tfDesc" value="${escapeHtml(t.description || "")}"></label>
      <div class="form-row">
        <label>Necessity
          <select id="tfNecessity">
            <option value="essential" ${t.necessity === "essential" ? "selected" : ""}>Essential</option>
            <option value="useful" ${t.necessity === "useful" ? "selected" : ""}>Useful</option>
            <option value="unnecessary" ${t.necessity === "unnecessary" ? "selected" : ""}>Unnecessary</option>
          </select>
        </label>
        <label>Payment
          <select id="tfPayment">
            ${optionList(["cash", "debit", "credit", "transfer", "other"], t.paymentMethod)}
          </select>
        </label>
      </div>
      <label>Notes<textarea id="tfNotes" rows="2">${escapeHtml(t.notes || "")}</textarea></label>
      <button type="submit" class="btn btn-primary btn-block">${existing ? "Save changes" : "Add"}</button>
    </form>
  `);

  // Switching type updates the category list.
  $("#tfType").addEventListener("change", (e) => {
    const list = e.target.value === "income" ? state.settings.incomeCategories : state.settings.expenseCategories;
    $("#tfCategory").innerHTML = optionList(list, "");
  });

  $("#txnForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat($("#tfAmount").value);
    if (!(amount >= 0)) { toast("Enter a valid amount."); return; }
    const record = {
      id: existing ? existing.id : uid(),
      type: $("#tfType").value,
      amount,
      date: $("#tfDate").value,
      category: $("#tfCategory").value,
      description: $("#tfDesc").value.trim(),
      necessity: $("#tfNecessity").value,
      paymentMethod: $("#tfPayment").value,
      notes: $("#tfNotes").value.trim()
    };
    if (existing) {
      const i = state.transactions.findIndex((x) => x.id === existing.id);
      state.transactions[i] = record;
    } else {
      state.transactions.push(record);
    }
    saveData();
    closeModal();
    renderAll();
    toast(existing ? "Transaction updated." : "Transaction added.");
  });
}

/* -----------------------------------------------------------
   16. SUBSCRIPTION FORM
   ----------------------------------------------------------- */
function openSubscriptionModal(existing) {
  const s = existing || { frequency: "monthly", importance: "useful", active: true, category: "Subscriptions" };
  openModal(existing ? "Edit subscription" : "Add subscription", `
    <form id="subForm" class="form">
      <div class="form-row">
        <label>Name<input type="text" id="sfName" value="${escapeHtml(s.name || "")}" required></label>
        <label>Cost<input type="number" step="0.01" min="0" id="sfCost" value="${s.monthlyCost ?? ""}" required></label>
      </div>
      <div class="form-row">
        <label>Frequency
          <select id="sfFreq">${optionList(["monthly", "yearly", "biweekly", "weekly"], s.frequency)}</select>
        </label>
        <label>Category<select id="sfCat">${optionList(state.settings.expenseCategories, s.category)}</select></label>
      </div>
      <div class="form-row">
        <label>Importance
          <select id="sfImp">${optionList(["essential", "useful", "optional"], s.importance)}</select>
        </label>
        <label>Next renewal<input type="date" id="sfRenew" value="${s.nextRenewal || ""}"></label>
      </div>
      <label class="check"><input type="checkbox" id="sfActive" ${s.active ? "checked" : ""}> Active</label>
      <label>Notes<textarea id="sfNotes" rows="2">${escapeHtml(s.notes || "")}</textarea></label>
      <button type="submit" class="btn btn-primary btn-block">${existing ? "Save" : "Add"}</button>
    </form>
  `);

  $("#subForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const cost = parseFloat($("#sfCost").value);
    if (!(cost >= 0)) { toast("Enter a valid cost."); return; }
    const record = {
      id: existing ? existing.id : uid(),
      name: $("#sfName").value.trim(),
      monthlyCost: cost,
      frequency: $("#sfFreq").value,
      category: $("#sfCat").value,
      importance: $("#sfImp").value,
      nextRenewal: $("#sfRenew").value,
      active: $("#sfActive").checked,
      notes: $("#sfNotes").value.trim()
    };
    if (existing) {
      const i = state.subscriptions.findIndex((x) => x.id === existing.id);
      state.subscriptions[i] = record;
    } else {
      state.subscriptions.push(record);
    }
    saveData();
    closeModal();
    renderAll();
    toast("Subscription saved.");
  });
}

/* -----------------------------------------------------------
   17. BUDGET FORM
   ----------------------------------------------------------- */
function openBudgetModal(existing) {
  const b = existing || { period: "monthly", alertThreshold: 80, active: true, category: "" };
  const catOptions = `<option value="" ${b.category === "" ? "selected" : ""}>Overall (all spending)</option>` +
    `<option value="__savings__" ${b.category === "__savings__" ? "selected" : ""}>Savings target</option>` +
    optionList(state.settings.expenseCategories, b.category);

  openModal(existing ? "Edit budget" : "Add budget", `
    <form id="budgetForm" class="form">
      <label>Name<input type="text" id="bfName" value="${escapeHtml(b.name || "")}" required></label>
      <div class="form-row">
        <label>Applies to<select id="bfCat">${catOptions}</select></label>
        <label>Amount<input type="number" step="0.01" min="0" id="bfAmount" value="${b.amount ?? ""}" required></label>
      </div>
      <div class="form-row">
        <label>Alert threshold %<input type="number" min="0" max="100" id="bfThreshold" value="${b.alertThreshold ?? 80}"></label>
        <label class="check"><input type="checkbox" id="bfActive" ${b.active ? "checked" : ""}> Active</label>
      </div>
      <label>Notes<textarea id="bfNotes" rows="2">${escapeHtml(b.notes || "")}</textarea></label>
      <button type="submit" class="btn btn-primary btn-block">${existing ? "Save" : "Add"}</button>
    </form>
  `);

  $("#budgetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat($("#bfAmount").value);
    if (!(amount >= 0)) { toast("Enter a valid amount."); return; }
    const record = {
      id: existing ? existing.id : uid(),
      name: $("#bfName").value.trim(),
      category: $("#bfCat").value,
      amount,
      period: "monthly",
      alertThreshold: parseFloat($("#bfThreshold").value) || 80,
      active: $("#bfActive").checked,
      notes: $("#bfNotes").value.trim()
    };
    if (existing) {
      const i = state.budgets.findIndex((x) => x.id === existing.id);
      state.budgets[i] = record;
    } else {
      state.budgets.push(record);
    }
    saveData();
    closeModal();
    renderAll();
    toast("Budget saved.");
  });
}

/* -----------------------------------------------------------
   18. CONFIRM MODAL
   ----------------------------------------------------------- */
function confirmAction(message, onYes) {
  openModal("Please confirm", `
    <p style="margin-bottom:16px">${escapeHtml(message)}</p>
    <div class="btn-stack">
      <button class="btn btn-danger" id="confirmYes">Yes, continue</button>
      <button class="btn" id="confirmNo">Cancel</button>
    </div>
  `);
  $("#confirmYes").addEventListener("click", () => { closeModal(); onYes(); });
  $("#confirmNo").addEventListener("click", closeModal);
}

/* -----------------------------------------------------------
   19. EXPORT / IMPORT
   ----------------------------------------------------------- */
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJSON() {
  download(`javis-finance-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("JSON backup exported.");
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(type) {
  let rows = [];
  let name = "";
  if (type === "transactions") {
    name = `transactions-${viewMonth}.csv`;
    rows.push(["id", "date", "type", "amount", "category", "description", "necessity", "paymentMethod", "notes"]);
    state.transactions
      .filter((t) => inMonth(t.date, viewMonth))
      .forEach((t) => rows.push([t.id, t.date, t.type, t.amount, t.category, t.description, t.necessity, t.paymentMethod, t.notes]));
  } else if (type === "budgets") {
    name = `budgets-${viewMonth}.csv`;
    const s = calculateMonthlySummary(viewMonth);
    rows.push(["name", "appliesTo", "amount", "actual", "remaining", "pctUsed", "status"]);
    state.budgets.forEach((b) => {
      const st = calculateBudgetStatus(b, s);
      rows.push([b.name, b.category || "overall", b.amount, st.actual.toFixed(2),
        st.remaining.toFixed(2), st.pct.toFixed(1), st.status]);
    });
  } else if (type === "report") {
    name = `report-${viewMonth}.csv`;
    const s = calculateMonthlySummary(viewMonth);
    rows.push(["metric", "value"]);
    rows.push(["month", viewMonth]);
    rows.push(["income", s.income.toFixed(2)]);
    rows.push(["expenses", s.totalSpent.toFixed(2)]);
    rows.push(["netSavings", s.savings.toFixed(2)]);
    rows.push(["savingsRate%", s.savingsRate.toFixed(1)]);
    rows.push(["essential", (s.byNecessity.essential || 0).toFixed(2)]);
    rows.push(["useful", (s.byNecessity.useful || 0).toFixed(2)]);
    rows.push(["unnecessary", (s.byNecessity.unnecessary || 0).toFixed(2)]);
    rows.push([]);
    rows.push(["category", "amount"]);
    Object.entries(s.byCategory).forEach(([k, v]) => rows.push([k, v.toFixed(2)]));
  }
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  download(name, csv, "text/csv");
  toast("CSV exported.");
}

// Download a ready-to-fill CSV template with example rows.
function downloadCsvTemplate() {
  const header = ["date", "type", "amount", "category", "description", "necessity", "paymentMethod", "notes"];
  const example1 = ["2026-06-17", "expense", "250.00", "Food", "Lunch", "useful", "debit", "Example row - delete me"];
  const example2 = ["2026-06-15", "income", "9250.00", "Salary", "Quincena", "essential", "transfer", "Example row - delete me"];
  const csv = [header, example1, example2].map((r) => r.map(csvEscape).join(",")).join("\n");
  download("transactions-template.csv", csv, "text/csv");
  toast("Template downloaded.");
}

// Minimal but correct CSV parser: handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Returns an array of string[] rows.
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop fully-empty rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Accept YYYY-MM-DD (and forgiving variants like 2026/6/7) -> normalized ISO.
function normalizeDate(s) {
  const m = String(s).trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// Import transactions from a CSV file (appends to existing data).
function importTransactionsCSV(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(reader.result);
      if (rows.length < 2) { toast("CSV is empty or has no data rows."); return; }

      // Map columns by header name (case-insensitive, order-independent).
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (...names) => {
        for (const n of names) { const i = header.indexOf(n); if (i !== -1) return i; }
        return -1;
      };
      const col = {
        date: idx("date"), type: idx("type"), amount: idx("amount"),
        category: idx("category"), description: idx("description"),
        necessity: idx("necessity"), payment: idx("paymentmethod", "payment"),
        notes: idx("notes")
      };
      if (col.date === -1 || col.amount === -1) {
        toast("CSV needs at least 'date' and 'amount' columns.");
        return;
      }

      const NECESSITY = ["essential", "useful", "unnecessary"];
      const PAYMENT = ["cash", "debit", "credit", "transfer", "other"];
      const newTxns = [];
      let skipped = 0;

      for (let r = 1; r < rows.length; r++) {
        const cells = rows[r];
        const get = (k) => (col[k] >= 0 ? (cells[col[k]] ?? "").trim() : "");

        const date = normalizeDate(get("date"));
        const amount = parseFloat(get("amount"));
        if (!date || isNaN(amount) || amount < 0) { skipped++; continue; }

        const type = get("type").toLowerCase() === "income" ? "income" : "expense";
        let necessity = get("necessity").toLowerCase();
        if (!NECESSITY.includes(necessity)) necessity = "useful";
        let payment = get("payment").toLowerCase();
        if (!PAYMENT.includes(payment)) payment = "other";

        newTxns.push({
          id: uid(), type, amount, date,
          category: get("category") || "Other",
          description: get("description"),
          necessity, paymentMethod: payment,
          notes: get("notes")
        });
      }

      if (!newTxns.length) { toast("No valid rows found in CSV."); return; }

      state.transactions.push(...newTxns);
      saveData();
      renderAll();
      toast(`Imported ${newTxns.length} transaction(s)` + (skipped ? `, skipped ${skipped}.` : "."));
    } catch (err) {
      console.error(err);
      toast("CSV import failed — check the file format.");
    }
  };
  reader.readAsText(file);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = migrate(parsed);
      saveData();
      applyTheme();
      fillCategorySelects();
      loadSettingsForm();
      renderAll();
      toast("Backup imported successfully.");
    } catch (err) {
      console.error(err);
      toast("Import failed — invalid file.");
    }
  };
  reader.readAsText(file);
}

/* -----------------------------------------------------------
   20. SETTINGS
   ----------------------------------------------------------- */
function loadSettingsForm() {
  const s = state.settings;
  $("#setBiweekly").value = s.biweeklyIncome;
  $("#setMonthly").value = s.monthlyIncome;
  $("#setFrequency").value = s.incomeFrequency;
  $("#setCurrency").value = s.currency;
  $("#setSavingsPct").value = s.savingsGoalPct;
  $("#setSpendPct").value = s.spendingLimitPct;
  $("#setMonthlyBudget").value = s.monthlyBudget;
  $("#setFirstDay").value = s.firstDayOfMonth;
  $("#setTheme").value = s.theme;
  $("#setExpenseCats").value = s.expenseCategories.join(", ");
  $("#setIncomeCats").value = s.incomeCategories.join(", ");
}

function saveSettingsForm() {
  const s = state.settings;
  s.biweeklyIncome = parseFloat($("#setBiweekly").value) || 0;
  s.monthlyIncome = parseFloat($("#setMonthly").value) || 0;
  s.incomeFrequency = $("#setFrequency").value;
  s.currency = $("#setCurrency").value || "$";
  s.savingsGoalPct = parseFloat($("#setSavingsPct").value) || 0;
  s.spendingLimitPct = parseFloat($("#setSpendPct").value) || 0;
  s.monthlyBudget = parseFloat($("#setMonthlyBudget").value) || 0;
  s.firstDayOfMonth = parseInt($("#setFirstDay").value) || 1;
  s.theme = $("#setTheme").value;
  saveData();
  applyTheme();
  renderAll();
  toast("Settings saved.");
}

function saveCategories() {
  const parse = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const exp = parse($("#setExpenseCats").value);
  const inc = parse($("#setIncomeCats").value);
  if (!exp.length || !inc.length) { toast("Categories cannot be empty."); return; }
  state.settings.expenseCategories = exp;
  state.settings.incomeCategories = inc;
  saveData();
  fillCategorySelects();
  renderAll();
  toast("Categories saved.");
}

/* -----------------------------------------------------------
   21. THEME
   ----------------------------------------------------------- */
function applyTheme() {
  const t = state.settings.theme;
  if (t === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    document.documentElement.setAttribute("data-theme", t);
  }
}

/* -----------------------------------------------------------
   22. EVENT WIRING
   ----------------------------------------------------------- */
function wireEvents() {
  // Bottom navigation.
  $("#bottomNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (btn) showScreen(btn.dataset.nav);
  });

  // Month navigation.
  $("#prevMonth").addEventListener("click", () => { shiftMonth(-1); });
  $("#nextMonth").addEventListener("click", () => { shiftMonth(1); });

  // Quick add (dashboard).
  $("#quickAddForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat($("#qaAmount").value);
    if (!(amount >= 0)) { toast("Enter a valid amount."); return; }
    state.transactions.push({
      id: uid(), type: "expense", amount,
      date: $("#qaDate").value || todayISO(),
      category: $("#qaCategory").value,
      description: $("#qaDescription").value.trim(),
      necessity: "useful", paymentMethod: "debit", notes: ""
    });
    saveData();
    e.target.reset();
    $("#qaDate").value = todayISO();
    renderAll();
    toast("Expense added.");
  });

  // Transactions screen.
  $("#addTxnBtn").addEventListener("click", () => openTransactionModal(null));
  ["txnSearch", "txnFilterCategory", "txnFilterType", "txnSort"].forEach((id) =>
    $("#" + id).addEventListener("input", renderTransactions));

  // Subscriptions / budget / decision add buttons.
  $("#addSubBtn").addEventListener("click", () => openSubscriptionModal(null));
  $("#addBudgetBtn").addEventListener("click", () => openBudgetModal(null));

  // Decision form.
  $("#decisionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = {
      name: $("#decName").value.trim(),
      cost: parseFloat($("#decCost").value) || 0,
      category: $("#decCategory").value,
      necessary: $("#decNecessary").checked,
      supports: $("#decSupports").checked,
      canWait: $("#decCanWait").checked,
      freeAlt: $("#decFreeAlt").checked,
      notes: $("#decNotes").value.trim()
    };
    const result = evaluatePurchaseDecision(input);
    const box = $("#decisionResult");
    box.className = "decision-result " + result.cls;
    box.innerHTML = `<h4>${escapeHtml(result.verdict)}</h4><p>${escapeHtml(result.reason)}</p>`;

    // Persist to history.
    state.purchaseDecisions.push(Object.assign({
      id: uid(), date: todayISO(), verdict: result.verdict
    }, input));
    saveData();
    e.target.reset();
    renderDecisions();
  });

  // Delegated list actions (edit/delete).
  document.addEventListener("click", (e) => {
    const t = e.target;
    let id;
    if ((id = t.getAttribute?.("data-edit-txn"))) openTransactionModal(state.transactions.find((x) => x.id === id));
    else if ((id = t.getAttribute?.("data-del-txn"))) confirmAction("Delete this transaction?", () => {
      state.transactions = state.transactions.filter((x) => x.id !== id); saveData(); renderAll(); toast("Deleted.");
    });
    else if ((id = t.getAttribute?.("data-edit-sub"))) openSubscriptionModal(state.subscriptions.find((x) => x.id === id));
    else if ((id = t.getAttribute?.("data-del-sub"))) confirmAction("Delete this subscription?", () => {
      state.subscriptions = state.subscriptions.filter((x) => x.id !== id); saveData(); renderAll(); toast("Deleted.");
    });
    else if ((id = t.getAttribute?.("data-edit-budget"))) openBudgetModal(state.budgets.find((x) => x.id === id));
    else if ((id = t.getAttribute?.("data-del-budget"))) confirmAction("Delete this budget?", () => {
      state.budgets = state.budgets.filter((x) => x.id !== id); saveData(); renderAll(); toast("Deleted.");
    });
    else if ((id = t.getAttribute?.("data-del-dec"))) confirmAction("Delete this decision?", () => {
      state.purchaseDecisions = state.purchaseDecisions.filter((x) => x.id !== id); saveData(); renderDecisions(); toast("Deleted.");
    });
  });

  // Modal close.
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target === $("#modalBackdrop")) closeModal(); });

  // Settings.
  $("#settingsForm").addEventListener("submit", (e) => { e.preventDefault(); saveSettingsForm(); });
  $("#saveCatsBtn").addEventListener("click", saveCategories);

  // Backup buttons.
  $("#exportJsonBtn").addEventListener("click", exportJSON);
  $("#exportTxnCsvBtn").addEventListener("click", () => exportCSV("transactions"));
  $("#exportBudgetCsvBtn").addEventListener("click", () => exportCSV("budgets"));
  $("#exportReportCsv").addEventListener("click", () => exportCSV("report"));
  $("#downloadCsvTemplateBtn").addEventListener("click", downloadCsvTemplate);
  $("#importTxnCsvInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) confirmAction("Add the transactions from this CSV to your data?", () => importTransactionsCSV(file));
    e.target.value = "";
  });
  $("#importJsonInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) confirmAction("Importing will overwrite all current data. Continue?", () => importJSON(file));
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () =>
    confirmAction("This erases ALL data on this device. This cannot be undone. Continue?", () => {
      state = defaultData(); saveData(); applyTheme(); fillCategorySelects(); loadSettingsForm(); renderAll();
      toast("All data reset.");
    }));

  // React to system theme changes when in "system" mode.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.settings.theme === "system") applyTheme();
  });
}

function shiftMonth(delta) {
  const [y, m] = viewMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  viewMonth = monthKey(d);
  renderAll();
}

/* -----------------------------------------------------------
   23. INIT
   ----------------------------------------------------------- */
function init() {
  loadData();
  applyTheme();
  fillCategorySelects();
  loadSettingsForm();
  $("#qaDate").value = todayISO();
  wireEvents();
  renderAll();
  showScreen("dashboard");

  // Register the service worker for offline support.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((err) =>
        console.warn("Service worker registration failed:", err));
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
