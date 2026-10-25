(() => {
const C = window.OPS_CONFIG, LS = "opsdash.key", LO = "opsdash.owner";
const $ = s => document.querySelector(s), app = $("#app"), st = $("#status");
const params = new URLSearchParams(location.search);
const MOCK = params.has("mock"); // ?mock -> local seed file, read-only, no token
let data = null, sha = null;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const owner = () => C.owner || localStorage.getItem(LO) || "";
const api = () => `https://api.github.com/repos/${owner()}/${C.repo}/contents/${C.path}`;
const hdr = () => ({Authorization: `Bearer ${localStorage.getItem(LS)}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"});
const b64d = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g,"")), c => c.charCodeAt(0)));
const b64e = s => { const u = new TextEncoder().encode(s); let r = ""; for (const x of u) r += String.fromCharCode(x); return btoa(r); };

async function load() {
  st.textContent = "loading…";
  if (MOCK) { data = await (await fetch(params.get("mock") || "../ops-data/data.json", {cache:"no-store"})).json(); st.textContent = "MOCK mode (local seed, edits not saved)"; return render(); }
  if (!localStorage.getItem(LS) || !owner()) { $("#keybox").hidden = false; st.textContent = "needs key"; return; }
  const r = await fetch(`${api()}?ref=${C.branch}`, {headers: hdr(), cache: "no-store"});
  if (r.status === 401 || r.status === 403 || r.status === 404) { st.textContent = `GitHub said ${r.status}: check the key or repo name`; $("#keybox").hidden = false; return; }
  const j = await r.json(); sha = j.sha; data = JSON.parse(b64d(j.content));
  st.textContent = `synced ${new Date().toLocaleTimeString()}`; render();
}

// mutate: function applied to data; on 409/422 conflict refetch, reapply, retry
async function save(mutate, msg) {
  mutate(data); render();
  if (MOCK) return;
  for (let i = 0; i < 3; i++) {
    st.textContent = "saving…";
    data.updated = new Date().toISOString();
    const r = await fetch(api(), {method: "PUT", headers: hdr(), body: JSON.stringify({message: msg || "dashboard edit", content: b64e(JSON.stringify(data, null, 1)), sha, branch: C.branch})});
    if (r.ok) { sha = (await r.json()).content.sha; st.textContent = `saved ${new Date().toLocaleTimeString()}`; return; }
    if (r.status === 409 || r.status === 422) {
      const g = await (await fetch(`${api()}?ref=${C.branch}`, {headers: hdr(), cache: "no-store"})).json();
      sha = g.sha; data = JSON.parse(b64d(g.content)); mutate(data); continue;
    }
    st.textContent = `save failed (${r.status})`; return;
  }
  st.textContent = "save conflict: refresh"; render();
}

const empty = t => `<p class="empty">${t || "Nothing here."}</p>`;
const pill = s => { const k = /submit|active|done|ok|shortlist/i.test(s) ? "ok" : /needs|billy|apply.?now/i.test(s) ? "billy" : /closed|retired|fail|skip/i.test(s) ? "muted" : "warn"; return `<span class="pill ${k}">${esc(s)}</span>`; };
const table = (rows, cols) => rows?.length ? `<table><tr>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr>${rows.map(r => `<tr class="${qc(r).trim()}">${cols.map(c => `<td>${c[2] ? c[2](r) : esc(r[c[1]])}</td>`).join("")}</tr>`).join("")}</table>` : empty();
const QS = ["urgent-important","important-not-urgent","passion-project"], QL = {"urgent-important":"Urgent+important","important-not-urgent":"Important, not urgent","passion-project":"Passion project"};
const qc = r => QS.includes(r?.quadrant) ? ` q-${r.quadrant}` : "";
const qsel = (attr, r) => `<select class="qsel" ${attr} title="Quadrant"><option value="">untagged</option>${QS.map(q=>`<option value="${q}" ${r.quadrant===q?"selected":""}>${q}</option>`).join("")}</select>`;
const CLOSED = /closed|rejected|fail|skip|retired|done/i;
const JOB_ST = ["submitted","skipped_over","closed_detected","closed_by_human","apply_now","remove"]; // dropdown order; all roles shown, status is metadata
const jnorm = s => String(s ?? "").toLowerCase().replace(/[\s_-]+/g,"_").replace(/^_|_$/g,"");
const JOB_PRI = ["apply_now","submitted","skipped_over","remove","closed_by_human","closed_detected"]; // default render order; unknown last
const jobSort = rows => (rows||[]).map((r,i)=>[r,i]).sort((a,b)=>{ const pa=JOB_PRI.indexOf(jnorm(a[0].status)), pb=JOB_PRI.indexOf(jnorm(b[0].status)); return ((pa<0?99:pa)-(pb<0?99:pb)) || (a[1]-b[1]); }).map(x=>x[0]); // stable, sorts a copy
const jobSel = (r, i) => { const n = jnorm(r.status), opts = JOB_ST.includes(n) ? JOB_ST : [r.status, ...JOB_ST]; return `<select data-app="${i}">${opts.map(s=>`<option value="${esc(s)}" ${(s===n||s===r.status)?"selected":""}>${esc(String(s??"").replace(/_/g," "))}</option>`).join("")}</select>`; };
const trelloOpen = d => (d.trello||[]).filter(x=>!x.linked); // linked = duplicate of a seeded item (shown there)
function openCards(d) { // open cards: logs (WSJ sent/contacts/replies) are history, not cards
  const w = d.wsj || {}, j = d.jobs || {};
  return [...(d.todos||[]).filter(t=>!t.done), ...(d.schedule||[]), ...(d.routines||[]), ...(w.next?[w.next]:[]),
    ...(j.shortlist||[]), ...(j.applications||[]).filter(a=>!CLOSED.test(a.status||"")), ...(d.trades||[]),
    ...(d.fleet||[]).filter(f=>!CLOSED.test(f.state||"")), ...(d.parked||[]), ...trelloOpen(d).filter(x=>x.section==="cwo"&&!x.done)]; // completed + backlog cards excluded from quadrant counts
}
function qsummary(d) {
  const c = {"urgent-important":0,"important-not-urgent":0,"passion-project":0,untagged:0};
  for (const r of openCards(d)) c[QS.includes(r.quadrant) ? r.quadrant : "untagged"]++;
  const cls = {"urgent-important":"billy","important-not-urgent":"bot","passion-project":"muted",untagged:"warn"};
  $("#qsum").innerHTML = Object.entries(c).map(([k,n]) => `<span class="pill ${cls[k]}">${QL[k]||"Untagged"}: <b>${n}</b></span>`).join("");
}
const link = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);

// ZeroDrift Daily: client-side filter by text or tag; shown in the ZDD column, excluded from generic sections
const ZDD_RE = /\bzdd\b|zero\s?drift|vera voice|workbook walter|trello scan|self-audit/i;
const isZ = r => r && ((r.tags||[]).some(t => /zdd|zerodrift/i.test(t)) || r.project === "zdd" || ZDD_RE.test([r.text,r.name,r.bot,r.note].filter(Boolean).join(" ")));
const ZDD_BOARD = "https://trello.com/b/fIYJQKlK/zerodrift-daily";
const todoLi = (t,i) => `<li class="${qc(t).trim()}"><label class="${t.done?"done":""}"><input type="checkbox" data-todo="${i}" ${t.done?"checked":""}> ${esc(t.text)}</label>${t.trelloUrl?` <a class="tsmall" href="${esc(t.trelloUrl)}" target="_blank" rel="noopener">Trello ↗</a>`:""}${qsel(`data-tq="${i}"`, t)}</li>`;
const fmtDue = s => { if (!s) return ""; const d = new Date(s), od = d < new Date(); return ` <span class="pill ${od?"billy":"warn"}">due ${d.toLocaleDateString(undefined,{month:"short",day:"numeric"})}${od?" (overdue)":""}</span>`; };
const tLi = x => `<li class="tcard${qc(x)}">${x.section==="cwo"?`<input type="checkbox" data-tdone="${esc(x.id)}" ${x.done?"checked":""} title="Done (nightly sync completes it on Trello)"> `:""}${link(x.url, x.name)}${fmtDue(x.due)}<br><span class="tsmall">${esc(x.board)} · ${esc(x.list)}</span> ${qsel(`data-trq="${esc(x.id)}"`, x)}</li>`;
const tList = (xs, msg) => xs.length ? `<ul class="tlist">${xs.map(tLi).join("")}</ul>` : (msg ? empty(msg) : "");
const tBy = (d, sec) => trelloOpen(d).filter(x => sec==="cwo" ? x.section==="cwo" && !x.done : sec==="completed" ? x.section==="completed" || (x.section==="cwo" && x.done) : x.section === sec);
const tParked = xs => { const g = {}; xs.forEach(x => (g[x.board] ||= []).push(x)); return Object.entries(g).map(([b, v]) => `<details><summary>Trello: ${esc(b)} (${v.length})</summary>${tList(v)}</details>`).join(""); };
function render() {
  const d = data, w = d.wsj || {}, j = d.jobs || {};
  qsummary(d);
  const todos = (d.todos||[]).map((t,i)=>[t,i]), routines = d.routines||[], fleet = d.fleet||[], parked = d.parked||[];
  const zT = todos.filter(([t])=>isZ(t)), zR = routines.filter(isZ), zF = fleet.filter(isZ), zP = parked.filter(isZ);
  const pList = ps => ps.map(p=>`<li class="${qc(p).trim()}">${esc(p.text)}</li>`).join("");
  app.innerHTML = `
 <div class="col">
  <section class="card"><h2>✅ Today / to-dos</h2>
   <ul class="check">${todos.filter(([t])=>!isZ(t)).map(([t,i])=>todoLi(t,i)).join("") || empty()}</ul>
   ${tBy(d,"today").length?`<h3>Trello</h3>${tList(tBy(d,"today"))}`:""}
   <form id="addtodo"><input name="t" placeholder="Add a to-do" required style="flex:1"><button>Add</button></form></section>
 </div>
 <div class="col">
  <section class="card"><h2>💼 Job pipeline <button type="button" id="jobexport" title="Download job instructions JSON for Codex (all roles)">Export JSON</button> <button type="button" id="jobfeedback" title="I exported the JSON and sent it to Codex; clear this batch">Submitted Codex Feedback</button></h2>
   ${(j.shortlist||[]).length?`<h3>Shortlist</h3>${table(j.shortlist,[["Role","",r=>link(r.url,`${r.company}: ${r.title}`)],["Status","",r=>pill(r.status)]])}`:""}
   ${tBy(d,"jobs").length?`<h3>Trello</h3>${tList(tBy(d,"jobs"))}`:""}<h3>Applications</h3>${(j.applications||[]).length ? table(jobSort(j.applications),[["Role","",r=>link(r.url,`${r.company}: ${r.title}`)],["Status","",r=>jobSel(r, j.applications.indexOf(r))],["Note","",r=>`<input class="jnote" data-jnote="${j.applications.indexOf(r)}" value="${esc(r.note||"")}" placeholder="note for Codex">`]]) : empty(`Waiting for the next Codex email handoff${j.feedbackSubmittedAt?` (feedback submitted ${esc(j.feedbackSubmittedAt)})`:""}.`)}</section>
  <section class="card sponsors"><h2>🤝 Sponsor leads</h2>${(d.sponsorLeads||[]).length ? `<ul class="tlist">${[...d.sponsorLeads].sort((a,b)=>a.rank-b.rank).map(x=>`<li class="${x.done?"done":""}"><label><input type="checkbox" data-sl="${esc(x.id)}" ${x.done?"checked":""} title="Applied / done"> <b>#${esc(x.rank)}</b> ${link(x.url,x.brand)}</label> <span class="tsmall">applied/done</span><br>${esc(x.offer)}<br><span class="tsmall">${esc(x.eligibility)}</span><br><span class="tsmall">Next: ${esc(x.nextStep)}</span></li>`).join("")}</ul>` : empty("No sponsor leads")}
   <p class="tsmall"><a href="https://cursor.com/canvas/store-dcf0a6f8-e310-4fdc-b774-d13dd728b8b1/33d2f834-edb8-4139-882e-70345c2cd41c" target="_blank" rel="noopener">Sponsorship plan ↗</a></p></section>
 </div>
 <div class="col">
  <section class="card zdd"><h2>🌀 ZeroDrift Daily <a class="hlink" href="${ZDD_BOARD}" target="_blank" rel="noopener">Trello board ↗</a></h2>
   <h3>Currently Working On</h3>${tList(tBy(d,"cwo"),"Nothing in Currently Working On")}
   <h3>To-dos</h3><ul class="check">${zT.map(([t,i])=>todoLi(t,i)).join("") || empty("No ZDD to-dos yet")}</ul>
   <h3>Routines</h3>${zR.length ? table(zR,[["Routine","name"],["When","schedule"],["Status","status"]]) : empty("No ZDD routines yet")}
   <h3>Fleet</h3>${zF.length ? table(zF,[["Bot","bot"],["State","",r=>pill(r.state)],["Note","note"]]) : empty("No ZDD bots yet")}
   <h3>Parked</h3>${zP.length ? `<ul>${pList(zP)}</ul>` : empty("No ZDD parked items yet")}</section>
  <section class="card completed"><h2>☑️ Completed <span class="tsmall">checked off in Currently Working On</span></h2>${tBy(d,"completed").length ? `<ul class="tlist">${tBy(d,"completed").map(x=>`<li class="done">${x.section==="cwo"?`<input type="checkbox" data-tdone="${esc(x.id)}" checked title="Uncheck to move back (pending Trello sync)"> `:""}${link(x.url,x.name)}<br><span class="tsmall">${esc(x.board)} · ${esc(x.list)}</span></li>`).join("")}</ul>` : empty("No completed cards")}</section>
 </div>
 <div class="col">
  <section class="card"><h2>📈 Trades</h2>${table(d.trades,[["Ticker","ticker"],["Position","position"],["Status","status"]]).replace("Nothing here.","No open trades.")}${tList(tBy(d,"trades"))}</section>
 </div>
 <div class="lower"><h2 class="lowh">Lower priority</h2><div class="lowgrid">
 <div class="col">
  <section class="card"><h2>🕒 Routines & schedule</h2><h3>Schedule</h3>${table(d.schedule,[["When","when"],["What","what"]])}
   <h3>Routines</h3>${table(routines.filter(r=>!isZ(r)),[["Routine","name"],["When","schedule"],["Owner","owner"],["Status","status"]])}${tList(tBy(d,"routines"))}</section>
 </div>
 <div class="col">
  <section class="card"><h2>📨 WSJ hunt</h2>
   <h3>Next contact</h3>${w.next ? `<p class="${qc(w.next).trim()}" style="padding-left:8px"><b>#${esc(w.next.n)} ${esc(w.next.name)}</b><br>${esc(w.next.email)} · ${esc(w.next.phone)}<br>${esc(w.next.address)}</p>` : empty()}
${tBy(d,"wsj").length?`<h3>Trello</h3>${tList(tBy(d,"wsj"))}`:""}
   <h3>Replies</h3>${table(w.replies,[["Date","date"],["Who","who"],["What","what"]])}
   <details><summary>Sent log (${(w.sent||[]).length})</summary>${table([...(w.sent||[])].reverse(),[["Date","date"],["Entry","entry"]])}</details>
   <details><summary>Contact list (${(w.contacts||[]).length})</summary>${table(w.contacts,[["#","n"],["Name","name"],["Email","email"]])}</details></section>
 </div>
 <div class="col">
  <section class="card"><h2>🤖 Fleet</h2>${table(fleet.filter(f=>!isZ(f)),[["Bot","bot"],["State","",r=>pill(r.state)],["Note","note"]])}${tList(tBy(d,"fleet"))}</section>
 </div>
 <div class="col">
  <section class="card backlog"><details><summary><b>🗂️ Backlog</b> (${tBy(d,"backlog").length})</summary>${tList(tBy(d,"backlog"),"Backlog is empty")}</details></section>
 </div>
 </div>
 <div class="parkedrow">
 <div class="col">
  <section class="card"><h2>🅿️ Parked</h2><ul>${pList(parked.filter(p=>!isZ(p))) || empty()}</ul>${tParked(tBy(d,"parked"))}</section>
 </div>
 </div>
 </div>`;
}

app.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.todo) { const i = +t.dataset.todo, v = t.checked, id = data.todos[i].id; save(d => { const x = d.todos.find(q => q.id === id); if (x) x.done = v; }, "toggle to-do"); }
  if (t.dataset.tq) { const i = +t.dataset.tq, v = t.value, id = data.todos[i].id; save(d => { const x = d.todos.find(q => q.id === id); if (x) { if (v) x.quadrant = v; else delete x.quadrant; } }, "to-do quadrant"); }
  if (t.dataset.tdone) { const id = t.dataset.tdone, v = t.checked; save(d => { const x = (d.trello||[]).find(q => q.id === id); if (x) { if (v) { x.done = true; x.doneAt = new Date().toISOString(); } else { delete x.done; delete x.doneAt; } } }, v ? "check trello card done" : "uncheck trello card"); }
  if (t.dataset.trq) { const id = t.dataset.trq, v = t.value; save(d => { const x = (d.trello||[]).find(q => q.id === id); if (x) { if (v) x.quadrant = v; else delete x.quadrant; } }, "trello quadrant"); }
  if (t.dataset.sl) { const id = t.dataset.sl, v = t.checked; save(d => { const x = (d.sponsorLeads||[]).find(q => q.id === id); if (x) { x.done = v; x.doneAt = v ? new Date().toISOString() : null; } }, v ? "sponsor lead applied" : "uncheck sponsor lead"); }
  if (t.dataset.jnote) { const r0 = data.jobs.applications[+t.dataset.jnote], id = r0.role_id, k = r0.url, v = t.value.trim(); save(d => { const x = d.jobs.applications.find(a => id ? a.role_id === id : a.url === k); if (x) { if (v) x.note = v; else delete x.note; } }, "job note"); }
  if (t.dataset.app) { const i = +t.dataset.app, v = t.value, r0 = data.jobs.applications[i], id = r0.role_id, k = r0.url; save(d => { const x = d.jobs.applications.find(a => id ? a.role_id === id : a.url === k); if (x) x.status = v; }, "job status"); }
});
// Export: command list for Codex to update Billy's job sheet (schemas/job-instructions.schema.json). Job data only.
const ACT = {apply_now:["APPLY","Apply to this role."], submitted:["MARK_APPLIED","Mark this role as applied on the job sheet."], skipped_over:["SKIP","Mark this role as skipped on the job sheet; do not apply."], closed_detected:["MARK_CLOSED","Mark this role as closed on the job sheet; the posting was detected as no longer live."], closed_by_human:["MARK_CLOSED","Mark this role as closed on the job sheet; Billy closed it manually."], remove:["REMOVE","Remove this role's row from the job sheet."]};
const SCAN = "Before dropping this row, evaluate this employer: decide whether it is valuable enough to scan for other openings that fit Billy's criteria (CS / onboarding / implementation / enablement / support+success hybrid, Austin or remote open to Texas, full-time, $70k+). If yes, scan its own careers board and add qualifying roles to the sheet as new rows; if no, note why.";
const normS = jnorm;
function chiNow() {
  const t = new Date(), f = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZoneName:"longOffset"});
  const p = Object.fromEntries(f.formatToParts(t).map(x => [x.type, x.value])), off = (p.timeZoneName.replace("GMT","") || "+00:00");
  return {date:`${p.year}-${p.month}-${p.day}`, iso:`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`};
}
function jobExport() {
  const j = data.jobs || {}, now = chiNow(), lh = j.lastHandoff || {};
  if (!(j.applications||[]).length) { st.textContent = "Nothing to export: the pipeline is empty."; alert("Nothing to export: the pipeline is empty (waiting for the next Codex email handoff)."); return; }
  const actions = (j.applications||[]).filter(a => a.role_id && ACT[normS(a.status)]).map(a => { const ds = normS(a.status), [action, instruction] = ACT[ds];
    return {role_id:a.role_id, employer:a.company||"", title:a.title||"", action, dashboard_status:ds, instruction, posting_url:a.url||null, note:(a.note||"").trim()||null, ...(action === "REMOVE" ? {analyze_company_for_other_roles:true, company_scan_instruction:SCAN} : {})}; });
  const summary = Object.fromEntries(Object.values(ACT).map(([k]) => [k, actions.filter(x => x.action === k).length]));
  const out = {schema:"grokbot-job-instructions", schema_version:"1.1", generated_at:now.iso, source_handoff:{message_id:String(lh.message_id||""), date:String(lh.date||"")},
    instructions_for_codex:"For each item in actions, find the job-sheet row by role_id (confirm with employer and title) and do what action says: APPLY = the role is queued for Billy to apply to; set its status so it is ready to apply. MARK_APPLIED = mark the row applied. SKIP = mark the row skipped and do not apply. MARK_CLOSED = mark the row closed; dashboard_status says why (closed_detected = the posting was detected as no longer live, closed_by_human = Billy closed it manually). REMOVE = first follow company_scan_instruction (decide whether the employer is worth scanning for other roles that fit Billy, and add qualifying roles as new rows or note why not), then delete the row. Add note to the row when it is not null. Change nothing else, and do not submit applications or contact anyone.",
    actions, summary};
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], {type: "application/json"}));
  const el = Object.assign(document.createElement("a"), {href: url, download: `job-instructions-${now.date}.json`}); document.body.append(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function jobFeedback() {
  const n = (data.jobs?.applications||[]).length;
  if (!n) { alert("The pipeline is already empty."); return; }
  if (!confirm(`This clears the current batch of ${n} roles from the dashboard. Export first if you haven't.`)) return;
  const ts = chiNow().iso;
  save(d => { const j = d.jobs ||= {}; j.applications = []; j.shortlist = []; j.lastHandoff = null; j.feedbackSubmittedAt = ts; j.awaiting = "next Codex email handoff"; j.source = "email-handoff"; }, `Submitted Codex feedback: cleared batch of ${n} roles`);
}
app.addEventListener("click", e => { if (e.target.id === "jobexport") jobExport(); if (e.target.id === "jobfeedback") jobFeedback(); });
app.addEventListener("submit", e => { if (e.target.id !== "addtodo") return; e.preventDefault(); const text = e.target.t.value.trim(), id = "t" + Date.now(); save(d => { (d.todos ||= []).push({id, text, done: false}); }, "add to-do"); });
$("#keyform").addEventListener("submit", e => { e.preventDefault(); localStorage.setItem(LO, $("#owner").value.trim()); localStorage.setItem(LS, $("#token").value.trim()); $("#token").value = ""; $("#keybox").hidden = true; load(); });
$("#forget").onclick = () => { localStorage.removeItem(LS); data = null; app.innerHTML = ""; $("#keybox").hidden = false; st.textContent = "key forgotten"; };
$("#reload").onclick = load;
if (C.owner) $("#owner").value = C.owner;
load().catch(err => st.textContent = "error: " + err.message);
})();
