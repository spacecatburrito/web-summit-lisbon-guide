"""My plan as an .ics file, served from a real URL: phones open a served calendar file in the Calendar app, while a
file built in the page is blocked by in-app browsers and only saved to Files on iPhone. Mirrors public/plan-export.js.
Times are Lisbon local; in November Lisbon is on UTC+0, so they are written as UTC."""
import json
from datetime import datetime, timedelta

from . import sessions, settings

MAX_ITEMS = 200


def app_link(sid: str) -> str:
    return f"https://attend.websummit.com/dl/lis26/event?id={sid}"


def _venue(it: dict) -> str:
    v = it.get("venue") or ""
    v = "" if v == "See event page" else v
    host = it.get("host") or ""
    if host and v.lower().startswith(host.lower()):
        v = v[len(host):].lstrip(" ,")
    return v


def _stamp(date: str, time: str, add_days: int = 0) -> str:
    return (datetime.fromisoformat(f"{date}T{time}") + timedelta(days=add_days)).strftime("%Y%m%dT%H%M00Z")


def _esc(s: str) -> str:
    return str(s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def _fold(line: str) -> str:
    # RFC 5545: lines longer than 75 octets continue on the next line after a space.
    parts, cur, size = [], "", 0
    for ch in line:
        n = len(ch.encode())
        if size + n > (75 if not parts else 74):
            parts.append(cur)
            cur, size = "", 0
        cur += ch
        size += n
    parts.append(cur)
    return "\r\n ".join(parts)


def plan_ics(entries: list[tuple[str, dict]], status: dict[str, str]) -> str:
    out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tss.wtf//WS26 guide//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:My Web Summit plan"]
    for kind, it in entries:
        start = it.get("start") or "09:00"
        # No end listed: three hours, as in the guide's archive rule. An end before the start runs past midnight.
        end = it.get("end") or f"{min(23, int(start[:2]) + 3):02d}{start[2:]}"
        if kind == "session":
            where, link = f"{it.get('loc')}, Web Summit, Lisbon", app_link(it["id"])
        else:
            where = ", ".join(x for x in (it.get("host"), _venue(it), it.get("area"), "Lisbon") if x)
            link = it.get("url") or ""
        st = status.get(it["id"])
        desc = (f"Status: {st}\n" if st else "") + (f"{it['host']}\n" if it.get("host") else "") + link
        out += ["BEGIN:VEVENT", f"UID:{kind}-{it['id']}@tss.wtf", "DTSTAMP:20261104T000000Z",
                f"DTSTART:{_stamp(it['date'], start)}", f"DTEND:{_stamp(it['date'], end, 1 if end < start else 0)}",
                f"SUMMARY:{_esc(it['title'])}", f"LOCATION:{_esc(where)}", f"URL:{link}", f"DESCRIPTION:{_esc(desc)}", "END:VEVENT"]
    out.append("END:VCALENDAR")
    return "\r\n".join(_fold(x) for x in out) + "\r\n"


def entries_for(ids: list[str]) -> list[tuple[str, dict]]:
    """Saved ids ("s:<id>" for sessions) -> known items in time order; unknown ids are skipped."""
    events = {e["id"]: e for e in json.loads(settings.EVENTS_PATH.read_text(encoding="utf-8"))}
    known = sessions.by_id()
    out = []
    for i in dict.fromkeys(ids):
        if i.startswith("s:") and i[2:] in known:
            out.append(("session", known[i[2:]]))
        elif i in events:
            out.append(("event", events[i]))
    return sorted(out, key=lambda x: (x[1]["date"], x[1].get("start") or ""))
