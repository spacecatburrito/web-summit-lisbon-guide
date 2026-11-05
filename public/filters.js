// Side-event list filters. Pure functions, shared by the page and the tests.
export const TOPICS = [
  { id: "crypto", label: "Web3" },
  { id: "fintech", label: "Fintech" },
  { id: "ai", label: "AI" },
  { id: "saas", label: "SaaS & B2B" },
  { id: "consumer", label: "Consumer" },
  { id: "investors", label: "Investors & pitching" },
  { id: "product", label: "Product" },
  { id: "regional", label: "Regional communities" },
  { id: "women", label: "Women in tech" },
  { id: "compliance", label: "Security & compliance" },
  { id: "careers", label: "Careers" },
  { id: "any", label: "General networking" },
];
export const DEFAULT_TOPICS = ["crypto", "fintech", "ai"];

// An event's topics: its sectors plus its themes (investors, product, regional communities and so on).
const topicsOf = (e) => [...e.tags.sectors, ...(e.tags.themes || [])];

// Topic chip row: selected topics first, then the rest in order while they fit on the lines the selected ones need
// (with room for "Other" at the end). Whatever does not fit goes under "Other".
export function fitTopicRow(items, { rowWidth, gap, otherWidth }) {
  const lines = (ws) => {
    let n = 1, x = 0;
    for (const w of ws) {
      if (x && x + gap + w > rowWidth) { n++; x = w; } else x = x ? x + gap + w : w;
    }
    return n;
  };
  const ordered = [...items.filter((i) => i.selected), ...items.filter((i) => !i.selected)];
  const row = items.filter((i) => i.selected);
  const base = lines([...row.map((i) => i.width), otherWidth]);
  if (lines(ordered.map((i) => i.width)) <= base) return { row: ordered.map((i) => i.id), more: [] };
  for (const i of ordered.slice(row.length)) {
    if (lines([...row, i].map((x) => x.width).concat(otherWidth)) > base) break;
    row.push(i);
  }
  return { row: row.map((i) => i.id), more: ordered.slice(row.length).map((i) => i.id) };
}

const isFree = (e) => e.price === "free" || e.price === "free tier";

// Returns the events that pass every filter, plus how many more the topic filter alone hides.
// `saved` (event ids) switches to the bookmarks view, which ignores the other filters.
export function filterEvents(events, { topics = DEFAULT_TOPICS, days = [], freeOnly = false, noBadge = false, saved = null } = {}) {
  if (saved) return { shown: events.filter((e) => saved.includes(e.id)), hiddenByTopic: 0 };
  const base = events
    .filter((e) => !days.length || days.includes(e.date))
    .filter((e) => !freeOnly || isFree(e))
    .filter((e) => !noBadge || !e.needs_badge);
  const shown = topics.length ? base.filter((e) => topicsOf(e).some((s) => topics.includes(s))) : base;
  return { shown, hiddenByTopic: base.length - shown.length };
}

const DAY_DATES = { d08: "2026-11-08", d09: "2026-11-09", d10: "2026-11-10", d11: "2026-11-11", d12: "2026-11-12", d13: "2026-11-13" };

// Lisbon clock reading {date: "YYYY-MM-DD", time: "HH:MM"}. Events end at `end`, or 3 hours after `start` when no end is listed;
// an end earlier than the start means the event runs past midnight.
function isOver(e, now) {
  if (e.date < now.date) return true;
  if (e.date > now.date || !e.start) return false;
  if (e.end && e.end < e.start) return false;
  const end = e.end || String(Math.min(24, +e.start.slice(0, 2) + 3)).padStart(2, "0") + e.start.slice(2);
  return end <= now.time;
}

// Splits events into what a visitor can still attend and the archive (past or closed).
export function splitArchive(events, now) {
  const active = [], archived = [];
  for (const e of events) (e.access === "closed" || isOver(e, now) ? archived : active).push(e);
  return { active, archived };
}

// Turns answers parsed from a free-text request into list filters.
export function answersToFilters(answers) {
  return {
    topics: answers.sector && answers.sector !== "any" ? [answers.sector] : [],
    days: (answers.days || []).map((d) => DAY_DATES[d]).filter(Boolean),
    noBadge: answers.badge === "no",
  };
}

// My plan: saved side-event ids and "s:<id>" session ids -> [{kind, item}] in time order; unknown ids are skipped.
export function planEntries(saved, events, sessions = []) {
  const ev = new Map(events.map((e) => [e.id, e])), se = new Map(sessions.map((s) => [s.id, s]));
  return saved
    .map((id) => (id.startsWith("s:") ? { kind: "session", item: se.get(id.slice(2)) } : { kind: "event", item: ev.get(id) }))
    .filter((x) => x.item)
    .sort((a, b) => a.item.date.localeCompare(b.item.date) || (a.item.start || "").localeCompare(b.item.start || ""));
}

// True while the plan holds something not yet sent anywhere (calendar, copy, share, messenger): the plan button shimmers.
export function planPending(saved, exported) {
  return saved.some((id) => !exported.includes(id));
}

// The first plan item that is still ahead or running at `now` (Lisbon clock), or null when the week is over.
export function nextUp(entries, now) {
  return entries.find((x) => !isOver(x.item, now)) || null;
}

const minutes = (date, time) => Date.parse(`${date}T${time}:00Z`) / 60000;
function span(it) {
  const start = minutes(it.date, it.start || "09:00");
  if (!it.end) return [start, start + 180];
  const end = minutes(it.date, it.end);
  return [start, end > start ? end : end + 24 * 60];
}

// Plan items that run at the same time: {id: [titles of the items it clashes with]}.
export function overlaps(entries) {
  const out = {};
  entries.forEach((a, i) => entries.slice(i + 1).forEach((b) => {
    const [s1, e1] = span(a.item), [s2, e2] = span(b.item);
    if (s1 < e2 && s2 < e1) {
      (out[a.item.id] ||= []).push(b.item.title);
      (out[b.item.id] ||= []).push(a.item.title);
    }
  }));
  return out;
}
