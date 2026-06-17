# Javi's Finance

A private, offline-first **personal finance PWA** for one user. No accounts, no
cloud, no trackers — every piece of data lives in your browser's `localStorage`
on your own device until *you* choose to export it.

Built with plain HTML, CSS, and vanilla JavaScript. No build step, no
frameworks, no dependencies. Just static files.

---

## Features

- **Dashboard** — month income, spending, remaining, savings rate, daily
  average, no-spend streak, subscription impact, budget utilization, a
  green/yellow/red status badge, progress bars, and a 10-second quick-add form.
- **Transactions** — add / edit / delete, filter by month, category, type,
  search by description, sort by date or amount.
- **Subscriptions** — track recurring costs, see monthly/yearly totals, % of
  income, most expensive, optional totals, and review suggestions.
- **Purchase Decision** — answer a few questions before buying and get a
  recommendation (*Do not buy / Wait 7 days / Allowed if within budget /
  Necessary purchase*). Tracks money avoided and delayed.
- **Budget** — overall, per-category, and savings-target budgets with live
  progress bars, status colors, and plain-language alerts.
- **Reports** — monthly summary text, income/expense/savings, budget
  performance, expenses by category, essential vs optional, top 5 expenses,
  CSV export.
- **Settings** — income, frequency, savings goal, spending limit, budgets,
  categories, currency, theme (light/dark/system), and all backup tools.
- **Offline** — a service worker caches the app shell so it runs with no
  network after the first load.

---

## Run it locally

The app is just static files, so any static server works. Pick one:

**Python (already on most machines):**
```bash
cd "finance pwa"
python -m http.server 4321
```
Then open <http://localhost:4321>.

**Node:**
```bash
npx serve .
```

> Opening `index.html` directly with `file://` mostly works, but the service
> worker (offline mode) only registers over `http://` or `https://`, so use a
> local server for the full PWA experience.

### Generate the PNG app icons (optional but recommended)
The manifest references `icons/icon-192.png` and `icons/icon-512.png`. A
generator is included:

1. Open <http://localhost:4321/icons/generate-icons.html>.
2. Click both download buttons.
3. Save the files into the `icons/` folder using the exact names shown.

The SVG icon already works on modern browsers, so this step is only needed for
the sharpest iOS Home Screen icon.

---

## Install on iPhone (Safari → Home Screen)

1. Host the files somewhere reachable from your iPhone over **HTTPS** — e.g.
   GitHub Pages, Netlify, Cloudflare Pages, or your own server. (iOS requires
   HTTPS for service workers. For a quick same-Wi-Fi test you can use the local
   server above, but Home Screen install really wants HTTPS.)
2. Open the URL in **Safari** on the iPhone.
3. Tap the **Share** button (the square with the up arrow).
4. Tap **Add to Home Screen**.
5. Name it (defaults to "Finance") and tap **Add**.
6. Launch it from the Home Screen — it opens full-screen like a native app and
   works offline.

---

## How data is stored

- All app data is kept in a single JSON object under the `localStorage` key
  `javisFinance.v1`, in this shape:

  ```json
  {
    "settings": {},
    "transactions": [],
    "subscriptions": [],
    "budgets": [],
    "purchaseDecisions": [],
    "metadata": { "version": "1.0.0", "createdAt": "", "updatedAt": "" }
  }
  ```

- `localStorage` is **per-device and per-browser**. Data does not sync between
  your phone and your laptop, and it never leaves the device on its own.
- Dates are stored internally in ISO format (`YYYY-MM-DD`). Money is shown with
  your chosen currency symbol (default `$`, MXN formatting).
- Clearing Safari website data, or "Reset all data" in Settings, erases
  everything. **Export regularly.**

---

## Backup & restore

In **Settings → Backup & data**:

- **Export all (JSON)** — full backup of everything. Keep this safe; it's your
  restore point.
- **Export transactions (CSV)** — current month's transactions for
  spreadsheets.
- **Export budgets (CSV)** — budget vs actual for the current month.
- **Export report CSV** (on the Reports screen) — the monthly report.
- **Import JSON backup** — restores from an exported JSON file. You'll be warned
  first because it **overwrites all current data**.
- **Reset all data** — wipes everything back to defaults (with confirmation).

**Suggested routine:** export a JSON backup once per pay period (every 15 days)
and save it to iCloud Drive or Files. To move to a new phone, open the app on
the new device and import that JSON.

---

## Suggested next improvements

1. **Recurring transactions** — auto-log salary and fixed bills each period.
2. **Subscription renewal reminders** — surface upcoming renewals on the
   dashboard.
3. **Multi-month trends** — line/area charts for spending and savings over time.
4. **IndexedDB migration** — more robust storage if data grows large.
5. **Encrypted export** — password-protected backup files.
6. **Quincena-aware budgeting** — budgets that reset on the 1st and 16th.
7. **Optional WebDAV/iCloud file sync** — keep it local-first but allow
   user-controlled sync.
8. **PNG icon auto-bundling** so no manual icon step is needed.

---

*Javi's Finance · v1.0.0 · 100% local, private by design.*
