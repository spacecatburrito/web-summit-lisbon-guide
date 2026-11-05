// Anonymous usage stats: no cookies, nothing the visitor types. The server keeps only the event name, a few short
// labels and a one-day hashed visitor count (see app/main.py, /api/t). Opening the guide once with ?notrack leaves
// a flag in this browser so the owner's own visits stay out of the numbers; ?track clears it.
let off = false;
try {
  const q = new URLSearchParams(location.search);
  if (q.has("notrack")) localStorage.setItem("ws26.notrack", "1");
  if (q.has("track")) localStorage.removeItem("ws26.notrack");
  off = localStorage.getItem("ws26.notrack") === "1";
} catch (_) { /* storage blocked: count the visit */ }
const visit = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");
let active = 0, sentActive = 0, lastTick = Date.now();
const seen = new Set();

export function track(e, p = {}) {
  if (off) return;
  const body = JSON.stringify({ v: visit, e, p });
  try {
    if (!(navigator.sendBeacon && navigator.sendBeacon("api/t", new Blob([body], { type: "application/json" })))) {
      fetch("api/t", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch (_) { /* stats never break the page */ }
}

// Where the visit came from: the link's utm tags, else the referring site, else direct.
function source() {
  const q = new URLSearchParams(location.search);
  if (q.get("utm_source")) return { src: q.get("utm_source"), camp: q.get("utm_campaign") || "" };
  try { const h = document.referrer && new URL(document.referrer).hostname; if (h && h !== location.hostname) return { src: h.replace(/^www\./, "") }; } catch (_) { /* bad referrer */ }
  return { src: "direct" };
}

function flushTime() {
  const t = Date.now();
  if (document.visibilityState === "visible") active += (t - lastTick) / 1000;
  lastTick = t;
  if (Math.round(active) - sentActive >= 5) { sentActive = Math.round(active); track("time", { s: String(sentActive) }); }
}

export function startTracking(tab, sectionIds) {
  track("view", { ...source(), tab, dev: innerWidth < 700 ? "mobile" : "desktop" });
  setInterval(flushTime, 30000);
  document.addEventListener("visibilitychange", flushTime);
  addEventListener("pagehide", flushTime);
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    const id = en.target.id;
    if (en.isIntersecting && !seen.has(id)) { seen.add(id); track("section", { id }); }
  }), { threshold: 0.3 });
  sectionIds.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href]");
    if (!a) return;
    const h = a.href;
    const to = /t\.me\/Lena_is_NEAR/i.test(h) ? "telegram" : /linkedin\.com\/in\/elenashiltseva/i.test(h) ? "linkedin" : /attend\.websummit\.com\/dl\/lis26\/event/.test(h) ? "app_event" : /attend\.websummit\.com/.test(h) ? "ws_app"
      : /revolut\.me/.test(h) ? "coffee" : /websummit\.com\/sessions/.test(h) ? "session" : /websummit\.com\/schedule/.test(h) ? "schedule"
      : a.closest(".ev") ? "event" : null;
    if (to) track("click", { to });
  });
}
