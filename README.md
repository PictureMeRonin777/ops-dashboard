# ops-dashboard (PUBLIC)
Static layout only (index.html, style.css, app.js, config.js). No data, no secrets, no build step.
Data loads at runtime from the PRIVATE repo `ops-data` (data.json) via the GitHub contents API, using a
fine-grained token kept only in your browser's localStorage. "Forget key" clears it.
Local test: from the parent folder run `python3 -m http.server 8000`, open http://localhost:8000/ops-dashboard/?mock
(mock mode reads ../ops-data/data.json and does not save). See SETUP.md.

## Trello sync (snapshot)
Data.json `trello` array is a snapshot. Refresh: dump each board via the user-Trello connector (trelloReadCard list_by_board, filter=open) into trello-dump/*.json, then `python3 trello_sync.py <dump> ops-data/data.json` (keeps quadrant edits, links duplicates). Rendered per `section`; quadrant editable via the dashboard.
