// Deterministic plan builder. No network, no LLM.
import { QUIZ, DAY_DATES } from "./quiz-data.js";

const W = { goal: 3, sector: 2, audience: 2, community: 2, vibe: 1, pick: 1 };
const MAX_PER_DAY = 2;
const MAX_TOTAL = 8;
const MAX_TIPS = 5;

export function scoreEvent(answers, event) {
  const t = event.tags;
  let s = 0;
  if (t.goals.includes(answers.goal)) s += W.goal;
  if (t.sectors.includes(answers.sector)) s += W.sector;
  if (t.audience.includes(answers.role)) s += W.audience;
  const groups = (answers.groups || []).filter((g) => g !== "none");
  if (groups.some((g) => t.communities.includes(g))) s += W.community;
  if (vibeMatches(answers.evenings, t.vibe)) s += W.vibe;
  if (event.elena_pick) s += W.pick;
  return s;
}

function vibeMatches(evenings, vibe) {
  if (evenings === "party") return vibe === "party" || vibe === "networking";
  if (evenings === "drinks") return vibe === "networking" || vibe === "dinner";
  return vibe === "breakfast" || vibe === "talk" || vibe === "workshop";
}

function vibeAllowed(evenings, vibe) {
  if (evenings === "day") return vibe !== "party" && vibe !== "dinner";
  if (evenings === "drinks") return vibe !== "party";
  return true;
}

function overlaps(a, b) {
  if (a.date !== b.date || !a.start || !b.start) return false;
  const aEnd = a.end || addHours(a.start, 2);
  const bEnd = b.end || addHours(b.start, 2);
  return a.start < bEnd && b.start < aEnd;
}

function addHours(hhmm, h) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return String(Math.min(23, hh + h)).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

export function buildPlan(answers, events, tips) {
  const dates = (answers.days || []).map((d) => DAY_DATES[d]).filter(Boolean).sort();
  const hasBadge = answers.badge === "yes";
  const candidates = events
    .filter((e) => e.access !== "closed")
    .filter((e) => dates.includes(e.date))
    .filter((e) => hasBadge || !e.needs_badge)
    .filter((e) => vibeAllowed(answers.evenings, e.tags.vibe))
    .map((e) => ({ e, s: scoreEvent(answers, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.e.start || "").localeCompare(b.e.start || ""));

  const byDay = new Map(dates.map((d) => [d, []]));
  let total = 0;
  for (const { e } of candidates) {
    if (total >= MAX_TOTAL) break;
    const bucket = byDay.get(e.date);
    if (bucket.length >= MAX_PER_DAY) continue;
    if (bucket.some((p) => overlaps(p, e))) continue;
    bucket.push(e);
    total += 1;
  }
  const days = [];
  const emptyDays = [];
  for (const d of dates) {
    const list = byDay.get(d).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    if (list.length) days.push({ date: d, events: list });
    else emptyDays.push(d);
  }
  return { days, emptyDays, tips: pickTips(answers, tips), summary: summarize(answers, emptyDays) };
}

function pickTips(answers, tips) {
  const want = new Set(["logistics"]);
  if (answers.badge === "no") want.add("no_badge"); else want.add("badge");
  if (answers.evenings !== "day") want.add("evenings");
  if (["party"].includes(answers.goal)) want.add("party");
  if (["hire", "get_hired", "cofounder", "raise", "sell"].includes(answers.goal)) want.add("networking");
  want.add("first_timer");
  const avoid = new Set();
  if (answers.badge === "no") avoid.add("badge");
  if (answers.evenings === "day") avoid.add("evenings");
  const order = ["no_badge", "badge", "logistics", "networking", "evenings", "party", "first_timer", "app", "food", "transport", "weather", "lisbon"];
  const scored = tips
    .filter((t) => !t.tags.some((g) => avoid.has(g)))
    .map((t) => ({ t, s: t.tags.reduce((n, g) => n + (want.has(g) ? 10 - Math.max(0, order.indexOf(g)) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, MAX_TIPS).map((x) => x.t);
}

function label(qid, oid) {
  const q = QUIZ.find((x) => x.id === qid);
  const o = q && q.options.find((x) => x.id === oid);
  return o ? o.label : oid;
}

function summarize(answers, emptyDays) {
  const who = answers.role === "other" ? "attendee" : label("role", answers.role).toLowerCase();
  const field = answers.sector === "any" ? "" : label("sector", answers.sector) + " ";
  const parts = [(field + who).replace(/^./, (c) => c.toUpperCase())];
  parts.push(answers.badge === "yes" ? "with a badge" : "no badge");
  const dayLabels = (answers.days || []).map((d) => label("days", d).split(" ")[0]);
  if (dayLabels.length) parts.push(dayLabels.length > 2 ? `${dayLabels[0]} to ${dayLabels[dayLabels.length - 1]}` : dayLabels.join(" and "));
  parts.push(answers.evenings === "day" ? "daytime only" : "evenings OK");
  let s = parts.join(", ") + ".";
  if (emptyDays.length) {
    const names = emptyDays.map((d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" }));
    s += answers.badge === "no"
      ? ` Nothing without a badge on ${names.join(", ")}; most in-venue meetups need one, so check the full list below for free side events.`
      : ` No strong match on ${names.join(", ")}; see the full list below.`;
  }
  return s;
}

if (typeof window !== "undefined") {
  window.WS26 = Object.assign(window.WS26 || {}, { buildPlan, scoreEvent });
}
