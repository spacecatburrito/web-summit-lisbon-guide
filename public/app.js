import { buildPlan } from "./plan.js";
import { TOPICS, DEFAULT_TOPICS, filterEvents, splitArchive, answersToFilters, fitTopicRow, planEntries, nextUp, overlaps, planPending } from "./filters.js";
import { findSessions, pickSessions, KINDS } from "./sessions.js";
import { track, startTracking } from "./track.js";
import { planText } from "./plan-export.js";

const $ = (s) => document.querySelector(s);
const DAY_NAMES = { "2026-11-08": "Sunday", "2026-11-09": "Monday", "2026-11-10": "Tuesday", "2026-11-11": "Wednesday", "2026-11-12": "Thursday", "2026-11-13": "Friday" };
const ACCESS_LABEL = { open: "open", register: "register", approval: "approval needed", invite: "invite only", badge: "badge needed", closed: "closed" };
const TAG_LABEL = { crypto: "Web3", fintech: "Fintech", ai: "AI", saas: "SaaS", consumer: "Consumer", any: "Networking",
  investors: "Investors", product: "Product", regional: "Community", women: "Women", compliance: "Compliance", careers: "Careers" };
const CHEVRON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BOOKMARK = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6.5 3.5h11v17l-5.5-4-5.5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const TABS = ["side-events", "summit", "lisbon"];
const ROBOT = `<svg class="robot" viewBox="0 0 64 48" width="60" height="45" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <g class="robot-body"><path d="M20 8V4"/><rect x="8" y="8" width="24" height="18" rx="8" fill="#fff"/><path d="M16 21q4 3 8 0"/><rect x="11" y="27" width="18" height="13" rx="4" fill="#fff"/><path d="M15 40v4M25 40v4"/></g>
  <g class="robot-arm"><path d="M29 31l9 0M38 31h11"/><rect x="47" y="25" width="7" height="12" rx="1.5" fill="#ffd21f"/></g>
  <rect x="42" y="38" width="18" height="5" rx="1.2" fill="currentColor"/>
  <path class="robot-spark" d="M57 33l3-3M58 36h4M55 31l1-4"/></g>
  <circle class="robot-ant" cx="20" cy="3.5" r="2.4" fill="currentColor"/><circle class="robot-eye" cx="15.5" cy="16" r="2.2" fill="currentColor"/><circle class="robot-eye" cx="24.5" cy="16" r="2.2" fill="currentColor"/></svg>`;
// "Buy me a coffee" link shown after a thumbs up; empty = no coffee line.
const COFFEE_URL = "https://revolut.me/cryptocorn";
const TODOS = [
  { id: "badge", title: "Collect your badge", html: "Airport Terminal 1 from Sat 7 Nov, or Pavilhão de Portugal next to the venue. Bring the ticket in the app and your <strong>photo ID</strong>." },
  { id: "pass", title: "Buy the transport pass at the airport", html: "3 days EUR 23 or 5 days EUR 31.50, sold next to badge pickup, 7 to 10 November only. Or skip it: a metro ride is about EUR 2 and you <strong>buy nothing</strong>, just tap your bank card or your phone with Apple Pay or Google Pay at the gate. Uber works too, but mind the traffic." },
  { id: "profile", title: "Write one line in your app profile", text: "What you work on and what you want this week. People read it before they accept a meeting." },
  { id: "requests", title: "Send meeting requests in the app", text: "Do it before you land; expect about one yes in four." },
  { id: "register", title: "Register for two or three side events a night", text: "Hosts approve one by one, so apply now and keep a backup for each evening.", link: "#side-events" },
  { id: "perks", title: "Claim your Perks", text: "Credits and discounts come with the ticket. In the Web Summit app, tap your profile picture, then Perks." },
];

let events = [], fitIds = new Set(), parsed = null;
let topics = loadJSON("ws26.topics", null) || [...DEFAULT_TOPICS];
let done = new Set(loadJSON("ws26.done", []));
let saved = loadJSON("ws26.saved", []), savedOnly = false;
let exported = loadJSON("ws26.exported", []);
let regStatus = loadJSON("ws26.status", {});
const STATUS = [["none", "Not yet"], ["applied", "Applied"], ["going", "Going"]];
let sessionsData = null, picked = [], vote = null;
let kinds = loadJSON("ws26.kinds", []);
const now = lisbonNow();

async function init() {
  events = await fetch("data/events.json").then((r) => r.json());
  $("#checked-on").textContent = fmtDate(events.map((e) => e.verified_on).sort().at(-1));
  initTabs();
  renderFilters();
  drawList();
  renderMeetups();
  renderTodos();
  initSaved();
  initSummit();
  startTracking(TABS.find((t) => !document.getElementById(t).hidden), ["kinds", "sessions-result", "todo", "hacks", "getting-around", "faq", "elena", "archive"]);
  document.querySelectorAll("details").forEach((d, i) => d.addEventListener("toggle", () => { if (d.open && d.closest("#faq")) track("faq", { n: String(i) }); }));
}

// My plan: any event card can be added on this device; "My plan" shows only those, across every filter.
function initSaved() {
  $("#f-saved").addEventListener("click", openPlan);
  ["#tab-plan", "#plan-float"].forEach((s) => $(s).addEventListener("click", openPlan));
  $('[data-export="share"]').hidden = !navigator.share;
  document.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", () => exportPlan(b.dataset.export)));
  $("#plan-list").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-status]");
    if (!b) return;
    const id = b.dataset.statusFor, k = b.dataset.status;
    if (k === "none") delete regStatus[id]; else regStatus[id] = k;
    saveJSON("ws26.status", regStatus);
    track("status", { k });
    renderPlan();
  });
  // Desktop: the corner button shows until the sticky tab bar reaches the top, then the bar's own button takes over.
  const stuck = () => document.body.classList.toggle("tabs-stuck", $("#tabs-sentinel").getBoundingClientRect().top < 0);
  addEventListener("scroll", () => requestAnimationFrame(stuck), { passive: true });
  stuck();
  syncSavedChip();
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-save]");
    if (!b) return;
    const id = b.dataset.save;
    saved = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    if (saved.includes(id)) track("plan", { id });
    saveJSON("ws26.saved", saved);
    document.querySelectorAll(`[data-save="${id}"]`).forEach((x) => { x.setAttribute("aria-pressed", String(saved.includes(id))); x.lastChild.textContent = planLabel(id); });
    syncSavedChip();
    if (!$("#plan").hidden) renderPlan();
  });
}

// My plan screen: shown in place of the tab panels; any tab in the bar brings the guide back.
function openPlan() {
  TABS.forEach((t) => { $(`#tab-${t}`).setAttribute("aria-selected", "false"); document.getElementById(t).hidden = true; });
  $("#plan").hidden = false;
  syncSavedChip();
  history.replaceState(null, "", "#plan");
  track("tab", { tab: "plan" });
  renderPlan();
  $("#plan").scrollIntoView({ block: "start" });
}

async function renderPlan() {
  if (saved.some((id) => id.startsWith("s:")) && !sessionsData) {
    try { sessionsData ||= await fetch("data/sessions.json").then((r) => r.json()); } catch (_) { /* sessions show once the programme loads */ }
  }
  const entries = planEntries(saved, events, sessionsData || []);
  $("#plan-actions").hidden = !entries.length;
  $("#plan-contact").hidden = !entries.length;
  $("#plan-status").textContent = "";
  renderNextUp(nextUp(entries, now));
  if (!entries.length) { $("#plan-list").innerHTML = `<p class="empty">Nothing here yet. Tap Add to plan on any side event or on a session picked for you.</p>`; return; }
  const byDay = new Map();
  entries.forEach((x) => byDay.set(x.item.date, [...(byDay.get(x.item.date) || []), x]));
  const clash = overlaps(entries);
  const extra = (x) => (clash[x.item.id] ? `<p class="overlap">Overlaps with ${esc(clash[x.item.id].join(", "))}</p>` : "")
    + (x.kind === "event" ? statusRow(x.item.id) : "");
  $("#plan-list").innerHTML = [...byDay].map(([d, l]) => `<section class="day"><h3>${DAY_NAMES[d]} <small>${fmtDay(d)}, ${l.length} ${l.length === 1 ? "item" : "items"}</small></h3>${l.map((x) => (x.kind === "event" ? eventRow(x.item, extra(x)) : sessionRow(x.item, extra(x)))).join("")}</section>`).join("");
}

// Side events need registration with the host: the visitor marks where they stand, on this device only.
function statusRow(id) {
  const cur = regStatus[id] || "none";
  return `<div class="status-row" role="group" aria-label="Registration"><span class="status-label">Registration</span>${STATUS.map(([k, label]) => `<button type="button" class="status-btn" data-status="${k}" data-status-for="${esc(id)}" aria-pressed="${cur === k}">${label}</button>`).join("")}</div>`;
}

function renderNextUp(x) {
  const box = $("#next-up");
  box.hidden = !x;
  if (!x) return;
  const it = x.item, when = `${DAY_NAMES[it.date]} ${fmtDay(it.date)}, ${it.start || "all day"}${it.end ? `-${it.end}` : ""}`;
  const place = x.kind === "session" ? `${it.loc}, Web Summit` : [it.venue && it.venue !== "See event page" ? it.venue : "", it.area].filter(Boolean).join(", ");
  const query = x.kind === "session" ? "MEO Arena, Lisbon" : it.address || [it.venue, it.area, "Lisbon"].filter(Boolean).join(", ");
  const link = x.kind === "session" ? `https://attend.websummit.com/dl/lis26/event?id=${it.id}` : it.url;
  box.innerHTML = `<p class="next-label">Next up</p><p class="next-when">${esc(when)}</p><h3>${esc(it.title)}</h3><p class="next-place">${esc(place)}</p>
    <p class="next-links"><a class="chip" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}" rel="noopener">Directions</a><a class="chip" href="${esc(link)}" rel="noopener">${x.kind === "session" ? "Open in the app" : "Event page"}</a></p>`;
}

const planLabel = (id) => (saved.includes(id) ? "In my plan" : "Add to plan");

// Take the plan out of the guide: calendar file, clipboard, the phone's share sheet, or a Telegram / WhatsApp message.
async function exportPlan(how) {
  const entries = planEntries(saved, events, sessionsData || []);
  const text = planText(entries, "https://tss.wtf/ws/", regStatus);
  const status = $("#plan-status");
  status.className = "send-status";
  track("export", { k: how });
  if (entries.length) { exported = [...saved]; saveJSON("ws26.exported", exported); syncSavedChip(); }
  if (how === "calendar") {
    // A served file, not one built in the page: iPhone opens it in Calendar, and in-app browsers do not block it.
    if (!entries.length) { status.textContent = "Add something to your plan first."; return; }
    const by = (k) => Object.keys(regStatus).filter((id) => regStatus[id] === k && saved.includes(id)).join(",");
    const q = new URLSearchParams({ ids: entries.map((x) => (x.kind === "session" ? `s:${x.item.id}` : x.item.id)).join(",") });
    if (by("going")) q.set("going", by("going"));
    if (by("applied")) q.set("applied", by("applied"));
    if (/Instagram|FBAN|FBAV|LinkedInApp/.test(navigator.userAgent)) {
      status.className = "send-status err";
      status.innerHTML = 'This app&rsquo;s browser can&rsquo;t add events to your calendar. Open the menu, choose <b>Open in browser</b>, and tap Add to calendar again. Or use Copy or Send to Telegram.';
      return;
    }
    location.href = `api/plan.ics?${q}`;
    status.textContent = "Your calendar should open with every item. Nothing happened? Open this page in Safari or Chrome and try again.";
  } else if (how === "copy") {
    try { await navigator.clipboard.writeText(text); status.textContent = "Copied. Paste it into your notes or a chat."; }
    catch (_) { status.className = "send-status err"; status.textContent = "Could not copy here. Try Share or Send to Telegram."; }
  } else if (how === "share") {
    try { await navigator.share({ title: "My Web Summit plan", text }); } catch (_) { /* closed the share sheet */ }
  } else {
    const url = how === "telegram" ? `https://t.me/share/url?url=${encodeURIComponent("https://tss.wtf/ws/")}&text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    open(url, "_blank", "noopener");
  }
}

function syncSavedChip() {
  const c = $("#f-saved");
  c.innerHTML = `${BOOKMARK}My plan (${saved.length})`;
  c.setAttribute("aria-pressed", String(savedOnly));
  const open = !$("#plan").hidden;
  document.querySelectorAll(".plan-count").forEach((n) => { n.textContent = saved.length; n.hidden = !saved.length; });
  const nudge = planPending(saved, exported);
  document.querySelectorAll("#tab-plan, #plan-float").forEach((b) => b.classList.toggle("nudge", nudge));
  document.querySelectorAll("#tab-plan, #plan-float").forEach((b) => { b.setAttribute("aria-pressed", String(open)); b.setAttribute("aria-label", `My plan, ${saved.length} saved`); });
}

// Tabs: hash-addressable, all panels visible without JS.
function initTabs() {
  document.querySelectorAll(".tabs [role=tab]").forEach((t) => t.addEventListener("click", (ev) => {
    ev.preventDefault();
    const id = t.getAttribute("aria-controls");
    openTab(id);
  }));
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (TABS.includes(id) && !a.closest(".tabs")) a.addEventListener("click", (ev) => { ev.preventDefault(); openTab(id); });
  });
  const fromHash = location.hash.slice(1);
  showTab(TABS.includes(fromHash) ? fromHash : tabOf(fromHash) || TABS[0]);
  if (fromHash === "plan") setTimeout(openPlan);
  if (fromHash && !TABS.includes(fromHash)) document.getElementById(fromHash)?.scrollIntoView();
}

// Switch tab from a click: update the URL and bring the panel into view.
function openTab(id) {
  showTab(id);
  track("tab", { tab: id });
  history.replaceState(null, "", `#${id}`);
  const bar = $(".tabs"), panel = document.getElementById(id);
  // Bottom bar on phones: always jump to the panel. Sticky top bar: only when the reader has scrolled past the panel start.
  if (getComputedStyle(bar).position === "fixed" || panel.getBoundingClientRect().top < bar.offsetHeight) panel.scrollIntoView({ block: "start" });
}

function tabOf(id) { const el = id && document.getElementById(id); return el ? TABS.find((t) => document.getElementById(t).contains(el)) : null; }

function showTab(id) {
  TABS.forEach((t) => {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === id));
    document.getElementById(t).hidden = t !== id;
  });
  $("#plan").hidden = true;
  syncSavedChip();
  if (id === "side-events") syncTopicChips();
}

// Free-text request: one Claude call on the server maps it onto quiz answers, which become list filters.
async function ask(text) {
  const status = $("#ask-status"), go = $("#ask-go");
  showThinking(status, "Hang on, a few seconds: our robot is working hard on it.");
  go.disabled = true;
  try {
    const res = await fetch("api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error("limit");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parsed = data;
    const f = answersToFilters(data.answers);
    topics = f.topics;
    saveJSON("ws26.topics", topics);
    document.querySelectorAll("#day-chips .chip").forEach((c) => c.setAttribute("aria-pressed", String(f.days.includes(c.dataset.date))));
    $("#f-nobadge").checked = f.noBadge;
    const visible = filterEvents(splitArchive(events.filter((e) => !e.id.startsWith("ws-")), now).active, { ...f, topics }).shown;
    const plan = buildPlan(data.answers, visible, []);
    fitIds = new Set(plan.days.flatMap((d) => d.events.map((e) => e.id)));
    $("#lda-line").hidden = !(data.answers.groups || []).includes("crypto_biz");
    status.textContent = "";
    syncTopicChips();
    drawList();
    renderUnderstood();
    $("#understood").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    status.className = "send-status err";
    status.textContent = err.message === "limit" ? "Too many requests from your network. Use the filters below." : "Could not read that right now. Try again, or use the filters below.";
  } finally {
    go.disabled = false;
  }
}

function renderUnderstood() {
  const el = $("#understood");
  el.textContent = "";
  if (!parsed) { el.hidden = true; return; }
  const parts = [];
  if (parsed.understood) parts.push(`We read this as: ${parsed.understood}.`);
  if (fitIds.size) parts.push(`${fitIds.size} events marked "good fit" below.`);
  el.append(document.createTextNode(parts.join(" ") + " "));
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "Clear";
  b.addEventListener("click", resetAsk);
  el.append(b);
  el.hidden = false;
}

function resetAsk() {
  parsed = null; fitIds = new Set();
  topics = [...DEFAULT_TOPICS]; saveJSON("ws26.topics", topics);
  document.querySelectorAll("#day-chips .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  $("#f-nobadge").checked = false;
  $("#ask-text").value = "";
  syncTopicChips(); drawList(); renderUnderstood();
}

function renderFilters() {
  $("#topic-chips").addEventListener("click", (ev) => {
    const more = ev.target.closest("#topic-more");
    if (more) return setMoreOpen(more.getAttribute("aria-expanded") !== "true");
    const c = ev.target.closest("[data-topic]");
    if (!c) return;
    const id = c.dataset.topic;
    track("filter", { k: id });
    topics = topics.includes(id) ? topics.filter((x) => x !== id) : [...topics, id];
    saveJSON("ws26.topics", topics);
    syncTopicChips();
    drawList();
  });
  addEventListener("resize", () => requestAnimationFrame(syncTopicChips));
  syncTopicChips();
  const dates = [...new Set(splitArchive(events, now).active.map((e) => e.date))].sort();
  $("#day-chips").innerHTML = dates.map((d) => `<button type="button" class="chip" data-date="${d}" aria-pressed="false">${fmtShort(d)}</button>`).join("");
  $("#day-chips").querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true")); drawList(); }));
  $("#f-free").addEventListener("change", drawList);
  $("#f-nobadge").addEventListener("change", drawList);
}

// Topic chips on as few lines as the selected ones need: selected first, then the rest while they fit, "Other" last
// with everything that did not fit. Re-laid out on every change and resize; a hidden tab (width 0) shows all chips.
function syncTopicChips() {
  const tc = $("#topic-chips");
  const open = $("#topic-more")?.getAttribute("aria-expanded") === "true";
  const byId = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
  const chip = (id) => `<button type="button" class="chip" data-topic="${id}" aria-pressed="${topics.includes(id)}">${byId[id].label}</button>`;
  const other = `<button type="button" class="chip chip-more" id="topic-more" aria-expanded="${open}" aria-controls="topic-more-list">Other${CHEVRON}</button>`;
  tc.innerHTML = `<div class="chips-measure" aria-hidden="true">${TOPICS.map((t) => chip(t.id)).join("")}${other}</div>`;
  const m = tc.firstElementChild;
  if (!tc.clientWidth) { tc.innerHTML = TOPICS.map((t) => chip(t.id)).join(""); return; }
  const width = Object.fromEntries([...m.querySelectorAll("[data-topic]")].map((c) => [c.dataset.topic, c.getBoundingClientRect().width]));
  const { row, more } = fitTopicRow(TOPICS.map((t) => ({ id: t.id, width: width[t.id], selected: topics.includes(t.id) })), {
    rowWidth: tc.clientWidth, gap: parseFloat(getComputedStyle(tc).columnGap) || 6, otherWidth: m.querySelector("#topic-more").getBoundingClientRect().width,
  });
  tc.innerHTML = row.map(chip).join("") + (more.length
    ? other + `<div class="chips chips-more" id="topic-more-list"${open ? "" : " hidden"}>${more.map(chip).join("")}</div>` : "");
}

function setMoreOpen(open) {
  $("#topic-more").setAttribute("aria-expanded", String(open));
  $("#topic-more-list").hidden = !open;
}

function drawList() {
  const pool = savedOnly ? events : events.filter((e) => !e.id.startsWith("ws-"));
  const split = splitArchive(pool, now);
  const active = split.active, archived = savedOnly ? split.archived.filter((e) => saved.includes(e.id)) : split.archived;
  const days = [...document.querySelectorAll('#day-chips .chip[aria-pressed="true"]')].map((c) => c.dataset.date);
  const opts = { topics, days, freeOnly: $("#f-free").checked, noBadge: $("#f-nobadge").checked, saved: savedOnly ? saved : null };
  const { shown, hiddenByTopic } = filterEvents(active, opts);
  $("#filters").hidden = savedOnly;
  syncSavedChip();
  const empty = savedOnly ? "Your plan is empty. Tap Add to plan on any event to build your week." : "Nothing matches these filters.";
  $("#list-days").innerHTML = shown.length ? byDayHTML(shown, true) : `<p class="empty">${empty}</p>`;
  const hint = $("#topic-hint");
  hint.textContent = "";
  hint.hidden = !hiddenByTopic;
  if (hiddenByTopic) {
    hint.append(document.createTextNode(`${hiddenByTopic} more ${hiddenByTopic === 1 ? "event" : "events"} in other topics. `));
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Show all topics";
    b.addEventListener("click", () => { topics = TOPICS.map((t) => t.id); saveJSON("ws26.topics", topics); syncTopicChips(); drawList(); });
    hint.append(b);
  }
  const arch = $("#archive");
  arch.hidden = !archived.length;
  $("#archive-title").textContent = `Past and closed (${archived.length})`;
  $("#archive-days").innerHTML = byDayHTML(archived, false);
}

function byDayHTML(list, counts) {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.start || "").localeCompare(b.start || ""));
  const byDay = new Map();
  sorted.forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) || []), e]));
  return [...byDay].map(([d, l]) => `<section class="day"><h3>${DAY_NAMES[d]} <small>${fmtDay(d)}${counts ? `, ${l.length} ${l.length === 1 ? "event" : "events"}` : ""}</small></h3>${l.map((e) => eventRow(e)).join("")}</section>`).join("");
}

function renderMeetups() {
  const list = splitArchive(events.filter((e) => e.id.startsWith("ws-") && e.id !== "ws-night-summit"), now).active;
  $("#summit-meetups").innerHTML = list.length ? byDayHTML(list, false) : `<p class="empty">The official meetups are over for this year.</p>`;
}

function eventRow(e, extra = "") {
  const when = e.start ? `${e.start}${e.end ? `-${e.end}` : ""}` : "All day";
  const sectors = e.tags.sectors.filter((s) => s !== "any");
  const label = sectors.length ? sectors.slice(0, 2) : (e.tags.themes || []).length ? e.tags.themes.slice(0, 1) : ["any"];
  const tags = [
    fitIds.has(e.id) ? `<span class="tag fit">good fit</span>` : "",
    ...label.map((s) => `<span class="tag t-${s}">${TAG_LABEL[s] || esc(s)}</span>`),
    `<span class="tag acc ${e.access}">${ACCESS_LABEL[e.access]}</span>`,
    e.price !== "free" ? `<span class="tag acc">${esc(e.price)}</span>` : "",
  ].join("");
  let venue = e.venue && e.venue !== "See event page" ? e.venue : "";
  if (venue.toLowerCase().startsWith(e.host.toLowerCase())) venue = venue.slice(e.host.length).replace(/^[\s,]+/, "");
  const where = [venue, e.area].filter(Boolean).join(", ");
  return `<article class="ev" data-event-id="${e.id}">
    <div class="ev-tags">${tags}</div>
    <h4 class="t"><a href="${e.url}" rel="noopener">${esc(e.title)}</a></h4>
    <p class="m"><time>${when}</time> ${esc(e.host)}${where ? `, ${esc(where)}` : ""}</p>
    <p class="n">${esc(e.note)}</p>
    ${extra}<button type="button" class="save" data-save="${e.id}" aria-pressed="${saved.includes(e.id)}">${BOOKMARK}<span>${planLabel(e.id)}</span></button></article>`;
}

// Checklist: a ticked task leaves the list and waits under "Done" so a mistaken tick can be undone.
function renderTodos() {
  const item = (t, isDone) => `<li class="todo-item${isDone ? " is-done" : ""}">
    <label><input type="checkbox" data-todo="${t.id}" ${isDone ? "checked" : ""}>
    <span><span class="todo-title">${esc(t.title)}</span><span class="todo-text">${t.html ?? esc(t.text)}${t.link ? ` <a href="${t.link}">Open side events</a>` : ""}</span></span></label></li>`;
  const open = TODOS.filter((t) => !done.has(t.id)), closed = TODOS.filter((t) => done.has(t.id));
  $("#todo-list").innerHTML = open.map((t) => item(t, false)).join("");
  $("#todo-done-list").innerHTML = closed.map((t) => item(t, true)).join("");
  $("#todo-empty").hidden = open.length > 0;
  $("#todo-done").hidden = !closed.length;
  $("#todo-done-title").textContent = `Done (${closed.length})`;
  $("#todo-count").textContent = open.length ? `${open.length} of ${TODOS.length} left: badge, transport, app profile, side events` : "All done";
  document.querySelectorAll("[data-todo]").forEach((c) => c.addEventListener("change", () => {
    c.checked ? done.add(c.dataset.todo) : done.delete(c.dataset.todo);
    if (c.checked) track("todo", { id: c.dataset.todo });
    saveJSON("ws26.done", [...done]);
    renderTodos();
  }));
  document.querySelectorAll('.todo-text a[href="#side-events"]').forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); openTab("side-events"); }));
}

// Inside the venue: the same request as on the Side events tab picks sessions from the official programme.
// Keyword candidates come from the browser (sessions.js); the server asks Claude to choose and explain.
function initSummit() {
  const boxes = [$("#ask-text"), $("#ask-summit-text")];
  const stored = loadJSON("ws26.query", "");
  boxes.forEach((b) => {
    if (stored && !b.value) b.value = stored;
    b.addEventListener("input", () => { boxes.forEach((o) => { if (o !== b) o.value = b.value; }); saveJSON("ws26.query", b.value); });
  });
  document.querySelectorAll(".kind").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.kind;
    track("kind", { k });
    kinds = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    saveJSON("ws26.kinds", kinds);
    syncKinds();
  }));
  syncKinds();
  $("#ask-summit").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("#ask-summit-text").value.trim();
    if (!text) { $("#summit-status").className = "send-status err"; $("#summit-status").textContent = "Write a sentence about what you want, for example your field and who you want to meet."; return; }
    track("find", { k: kinds.join("+") || "all" });
    findSummit(text);
  });
  document.querySelectorAll(".vote-btn").forEach((b) => b.addEventListener("click", () => castVote(b.dataset.vote)));
  $("#vote-note").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const note = $("#vote-note-text").value.trim();
    if (note) sendFeedback({ kind: "sessions", vote, note, query: $("#ask-summit-text").value.trim(), ids: picked.map((x) => x.id) });
    $("#vote-note").hidden = true;
    showThanks(Boolean(note));
  });
}

// Tiles show the choice; the button names what it will look for.
const KIND_WORDS = { talks: "talks and panels", meetups: "meetups", masterclasses: "masterclasses", booths: "startup booths", night: "Night Summit events" };
function syncKinds() {
  document.querySelectorAll(".kind").forEach((b) => b.setAttribute("aria-pressed", String(kinds.includes(b.dataset.kind))));
  const words = KINDS.filter((k) => kinds.includes(k.id)).map((k) => KIND_WORDS[k.id]);
  $("#ask-summit-go").textContent = words.length ? `Find ${words.length > 1 ? words.slice(0, -1).join(", ") + " and " + words.at(-1) : words[0]}` : "Find sessions";
}

async function findSummit(text) {
  const status = $("#summit-status"), go = $("#ask-summit-go");
  showThinking(status, "Hang on, up to 10-15 seconds: our robot is working hard on your picks.");
  go.disabled = true;
  try {
    sessionsData ||= await fetch("data/sessions.json").then((r) => r.json());
    const candidates = findSessions(sessionsData, text, 40, kinds);
    if (!candidates.length) {
      status.className = "send-status err";
      status.textContent = "Nothing in the programme matches those words. Try your industry, your role or who you want to meet.";
      return;
    }
    const ranked = await rankRemote(text, candidates.map((x) => x.id));
    const byId = Object.fromEntries(candidates.map((x) => [x.id, x]));
    picked = ranked ? ranked.picks.map((p) => ({ ...byId[p.id], why: p.why })) : pickSessions(candidates);
    renderSessions(ranked?.summary || "");
    status.textContent = "";
    $("#sessions-result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    status.className = "send-status err";
    status.textContent = "Could not load the programme right now. Try again in a minute.";
  } finally {
    go.disabled = false;
  }
}

// Waiting state while Claude works: a small robot, so the page reads as busy, not frozen. Any later textContent clears it.
function showThinking(el, text) {
  el.className = "send-status thinking";
  el.innerHTML = `${ROBOT}<span>${esc(text)}</span>`;
}

// Claude picks and explains; null on any failure, and the caller falls back to keyword order.
async function rankRemote(text, ids) {
  try {
    const res = await fetch("api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, ids }) });
    return res.ok ? await res.json() : null;
  } catch (_) { return null; }
}

function renderSessions(summary) {
  const list = [...picked].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const byDay = new Map();
  list.forEach((x) => byDay.set(x.date, [...(byDay.get(x.date) || []), x]));
  $("#sessions-summary").textContent = summary || `${list.length} sessions from the official programme that fit your request.`;
  $("#sessions-list").innerHTML = [...byDay].map(([d, l]) => `<section class="day"><h3>${DAY_NAMES[d]} <small>${fmtDay(d)}</small></h3>${l.map((x) => sessionRow(x)).join("")}</section>`).join("");
  vote = null;
  document.querySelectorAll(".vote-btn").forEach((b) => b.setAttribute("aria-pressed", "false"));
  $("#vote-note").hidden = true;
  $("#vote-thanks").hidden = true;
  $("#sessions-result").hidden = false;
}

function sessionRow(x, extra = "") {
  const when = `${x.start}${x.end ? `-${x.end}` : ""}`;
  return `<article class="ev session" data-session-id="${esc(x.id)}">
    <div class="ev-tags"><span class="tag t-any">${esc(x.format)}</span>${x.track && !x.track.toLowerCase().startsWith(x.format.toLowerCase()) ? `<span class="tag acc">${esc(x.track)}</span>` : ""}</div>
    <h4 class="t"><a href="${esc(x.url)}" rel="noopener">${esc(x.title)}</a></h4>
    <p class="m"><time>${when}</time> ${esc(x.loc)}${x.speakers?.length ? `, ${esc(x.speakers.slice(0, 2).join("; "))}` : ""}</p>
    ${x.why ? `<p class="n">${esc(x.why)}</p>` : ""}
    <p class="app-link"><a href="https://attend.websummit.com/dl/lis26/event?id=${esc(x.id)}" rel="noopener">Open in the Web Summit app</a></p>
    ${extra}<button type="button" class="save" data-save="s:${esc(x.id)}" aria-pressed="${saved.includes(`s:${x.id}`)}">${BOOKMARK}<span>${planLabel(`s:${x.id}`)}</span></button></article>`;
}

function castVote(v) {
  vote = v;
  track("vote", { k: v });
  document.querySelectorAll(".vote-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vote === v)));
  sendFeedback({ kind: "sessions", vote: v, query: $("#ask-summit-text").value.trim(), ids: picked.map((x) => x.id) });
  $("#vote-note-label").textContent = v === "up" ? "What did you like?" : "What was off? It helps fix the picks.";
  $("#vote-note-text").value = "";
  $("#vote-note").hidden = false;
  showThanks(false);
}

// After a vote: thanks, and after a thumbs up the coffee link (when set). `noted` marks a sent note.
function showThanks(noted) {
  const t = $("#vote-thanks");
  t.textContent = noted ? "Note sent. " : "";
  if (vote === "up" && COFFEE_URL) {
    t.append(document.createTextNode("Glad it helped. Every search here runs on Claude API tokens I pay for; if it saved you time, "));
    const a = document.createElement("a");
    a.href = COFFEE_URL; a.rel = "noopener"; a.textContent = "buy me a coffee";
    t.append(a, document.createTextNode("."));
  } else t.append(document.createTextNode(vote === "up" ? "Thanks, glad it helped." : "Thanks, this helps fix the picks."));
  t.hidden = false;
}

function sendFeedback(payload) {
  fetch("api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
}

$("#ask-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = $("#ask-text").value.trim();
  if (!text) { $("#ask-status").className = "send-status err"; $("#ask-status").textContent = "Write a sentence about what you want, or use the filters below."; return; }
  track("ask");
  ask(text);
});

// Lisbon wall clock; `?now=2026-11-10T20:00` overrides it for previews and QA.
function lisbonNow() {
  const o = new URLSearchParams(location.search).get("now");
  if (o && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(o)) return { date: o.slice(0, 10), time: o.slice(11) };
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function fmtDate(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" }); }
function fmtShort(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }); }
function fmtDay(d) { return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function loadJSON(k, fallback) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v ?? fallback; } catch (_) { return fallback; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

init();
