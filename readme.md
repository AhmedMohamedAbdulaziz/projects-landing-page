# Project Workspace

This workspace contains two standalone, browser-based applications built from the project briefs:

| Project | Folder | Description |
| --- | --- | --- |
| **Pennywise** | [`Personal Finance & Expense Tracker`](./Personal%20Finance%20%26%20Expense%20Tracker/index.html) | Record income and expenses, set monthly budgets, track savings goals, and see real calculated totals. |
| **Studyflow** | [`Smart Study Planner`](./Smart%20Study%20Planner/index.html) | Plan subjects and study tasks, manage a weekly schedule, track progress, and run a working focus timer. |

Both projects are plain HTML, CSS, and JavaScript. There is no framework, build step, package manager, or backend.

## Run locally

Open the `index.html` file inside either project folder in a modern browser.

For the most reliable `localStorage` behaviour, serve the folder over HTTP instead:

```bash
cd "E:\landing pages\project"
python -m http.server 8000
```

Then open:

- `http://localhost:8000/Personal%20Finance%20%26%20Expense%20Tracker/`
- `http://localhost:8000/Smart%20Study%20Planner/`

## Common notes

- All user data is saved in the browser using `localStorage`.
- Data is per browser and per device; there are no accounts and no cloud sync.
- Both apps include an optional sample-data button for demonstration. Sample figures are clearly labelled and can be removed with **Clear everything**.
- Both interfaces are responsive and include mobile navigation, form validation, keyboard focus states, and ARIA attributes where appropriate.
