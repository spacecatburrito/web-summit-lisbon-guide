// My plan export: plain text for notes and messengers. Pure functions. The calendar file is served by app/ics.py.

const DAY = { "2026-11-08": "Sunday", "2026-11-09": "Monday", "2026-11-10": "Tuesday", "2026-11-11": "Wednesday", "2026-11-12": "Thursday", "2026-11-13": "Friday" };
const appLink = (id) => `https://attend.websummit.com/dl/lis26/event?id=${id}`;
const dayLabel = (d) => `${DAY[d] || d} ${Number(d.slice(8))} Nov`;
// Venue without the host's name repeated in front, as on the event cards.
function venueOf(it) {
  let v = it.venue && it.venue !== "See event page" ? it.venue : "";
  if (it.host && v.toLowerCase().startsWith(it.host.toLowerCase())) v = v.slice(it.host.length).replace(/^[\s,]+/, "");
  return v;
}

function lines(x, status) {
  const it = x.item, when = it.start ? `${it.start}${it.end ? `-${it.end}` : ""}` : "All day";
  if (x.kind === "session") return [`${when} ${it.title}`, it.loc, appLink(it.id)].filter(Boolean);
  const place = [it.host, venueOf(it), it.area].filter(Boolean).join(", ");
  return [`${when} ${it.title}${status[it.id] ? ` (${status[it.id]})` : ""}`, place, it.url].filter(Boolean);
}

// `status`: {eventId: "applied" | "going"} for side events the visitor has registered for.
export function planText(entries, guideUrl, status = {}) {
  const out = ["My Web Summit plan", ""];
  let day = "";
  for (const x of entries) {
    if (x.item.date !== day) { day = x.item.date; out.push(dayLabel(day)); }
    out.push(...lines(x, status), "");
  }
  out.push(`Made with ${guideUrl}`);
  return out.join("\n");
}
