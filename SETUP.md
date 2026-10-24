# Setup (Billy)
## 1. Bot's computer: GitHub sign-in (one time)
The bot runs `gh auth login --web`; it shows an 8-character code. Open https://github.com/login/device, enter the code, approve.
Then the bot creates both repos and pushes: `ops-data` PRIVATE, `ops-dashboard` PUBLIC.
## 2. Enable Pages (free)
github.com/<you>/ops-dashboard -> Settings -> Pages -> Source: "Deploy from a branch" -> Branch `main`, folder `/ (root)` -> Save.
URL: https://<you>.github.io/ops-dashboard/ (bookmark it). Optionally set `owner` in config.js.
## 3. Create the scoped key (fine-grained personal access token)
github.com -> Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token:
- Token name: ops-dashboard
- Expiration: 90 days (or custom up to 1 year; you'll re-paste when it expires)
- Resource owner: your account
- Repository access: **Only select repositories** -> `ops-data` (only this one)
- Repository permissions: **Contents: Read and write**. (Metadata: Read-only is added automatically.) Everything else: No access.
- Account permissions: none.
Generate, copy, open the dashboard, paste username + token once. It is stored only in that browser's localStorage.
Never paste it into chat, a repo, or a file. Lost/leaked? Revoke it on the same page and make a new one; click "Forget key" on shared devices.
## Notes
- Each phone/browser needs the key pasted once.
- Edits (checkboxes, job status, new to-dos) PUT data.json with its sha; on a 409/422 conflict the page refetches, reapplies, and retries.
- Cost: $0 (private repos and Pages for public repos are free).
