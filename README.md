# ops-dashboard (PUBLIC)
Static layout only (index.html, style.css, app.js, config.js). No data, no secrets, no build step.
Data loads at runtime from the PRIVATE repo `ops-data` (data.json) via the GitHub contents API, using a
fine-grained token kept only in your browser's localStorage. "Forget key" clears it.
Local test: from the parent folder run `python3 -m http.server 8000`, open http://localhost:8000/ops-dashboard/?mock
(mock mode reads ../ops-data/data.json and does not save). See SETUP.md.
