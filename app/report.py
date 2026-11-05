"""Readable usage report for the guide's owner: how many came, how far they got towards the guide's goals, what they
saved, what they said, and one line per visit. Built only from the anonymous hits and feedback tables."""
import json
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone

from . import db, settings, sessions

# Goals in the order a visitor reaches them; a visit counts once per goal.
GOALS = [
    ("Used tabs or topic filters", lambda ev: ev & {"tab", "filter", "kind"}),
    ("Asked the robot for picks", lambda ev: ev & {"ask", "find"}),
    ("Added something to the plan", lambda ev: "plan" in ev),
    ("Opened My plan", lambda ev: "tab:plan" in ev),
    ("Exported or sent the plan", lambda ev: "export" in ev),
    ("Opened an event page or the app", lambda ev: ev & {"click:event", "click:session", "click:app_event", "click:ws_app"}),
    ("Wrote to Elena", lambda ev: ev & {"click:telegram", "click:linkedin"}),
    ("Opened the coffee link", lambda ev: "click:coffee" in ev),
]
CLICK_WORDS = {"telegram": "wrote on Telegram", "linkedin": "opened LinkedIn", "coffee": "opened coffee link", "event": "opened event page",
               "session": "opened session page", "app_event": "opened in app", "ws_app": "opened WS app", "schedule": "opened programme"}


def _dur(s: int) -> str:
    return f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"


def _titles() -> dict[str, str]:
    out = {e["id"]: e["title"] for e in json.loads(settings.EVENTS_PATH.read_text(encoding="utf-8"))}
    out.update({f"s:{k}": v["title"] for k, v in sessions.by_id().items()})
    return out


def _visits(rows: list[dict]) -> dict[str, dict]:
    visits: dict[str, dict] = {}
    for r in rows:
        p = json.loads(r["props_json"])
        v = visits.setdefault(r["visit"], {"start": r["ts"], "view": {}, "ev": set(), "secs": 0, "saves": [], "tabs": [], "n": Counter(), "exports": [], "clicks": []})
        e = r["event"]
        v["ev"].add(e)
        v["n"][e] += 1
        if e == "view":
            v["view"] = p
        elif e == "time":
            v["secs"] = max(v["secs"], int(p.get("s", "0") or 0))
        elif e == "plan":
            v["saves"].append(p.get("id"))
        elif e == "tab":
            v["ev"].add(f"tab:{p.get('tab')}")
            if p.get("tab") not in v["tabs"]:
                v["tabs"].append(p.get("tab"))
        elif e == "export":
            v["exports"].append(p.get("k", "?"))
        elif e == "click" and p.get("to"):
            v["ev"].add(f"click:{p['to']}")
            if p["to"] not in v["clicks"]:
                v["clicks"].append(p["to"])
    return {k: v for k, v in visits.items() if v["view"] or v["secs"]}


def _journey(v: dict) -> str:
    view = v["view"]
    src = view.get("src", "direct") + (f" / {view['camp']}" if view.get("camp") else "")
    path = " > ".join([view.get("tab", "?")] + [t for t in v["tabs"] if t != view.get("tab")])
    did = []
    for e, word in (("filter", "topic clicks"), ("kind", "kind clicks"), ("find", "robot searches"), ("ask", "side-event asks"), ("status", "status changes")):
        if v["n"][e]:
            did.append(f"{v['n'][e]} {word}")
    if v["saves"]:
        did.append(f"+{len(v['saves'])} to plan")
    did += [f"exported {k}" for k in v["exports"]]
    did += [CLICK_WORDS.get(c, c) for c in v["clicks"]]
    return f"{v['start'][5:16].replace('T', ' ')}  {view.get('dev', '?'):7}  {src:24}  {_dur(v['secs']):>7}  {path}" + (f"  | {', '.join(did)}" if did else "")


def usage_report(days: int = 7, now: datetime | None = None, journeys: int = 30) -> str:
    since = ((now or datetime.now(timezone.utc)) - timedelta(days=days)).isoformat(timespec="seconds")
    with db.connect() as con:
        rows = [dict(r) for r in con.execute("SELECT * FROM hits WHERE ts >= ? ORDER BY id", (since,))]
    visits = _visits(rows)
    total = len(visits)
    people = len({r["uid"] for r in rows if r["event"] == "view"})
    out = [f"WS26 guide, last {days} days (times UTC = Lisbon)", "", f"{total} visit{'s' * (total != 1)} by {people} {'person' if people == 1 else 'people'}"]
    if not total:
        return "\n".join(out)
    secs = [v["secs"] for v in visits.values()]
    out.append(f"Time on page: median {_dur(int(statistics.median(secs)))}, {sum(s >= 60 for s in secs)} visits stayed 1 min or more")
    out.append("Sources: " + ", ".join(f"{k} {n}" for k, n in Counter(
        v["view"].get("src", "direct") + (f" / {v['view']['camp']}" if v["view"].get("camp") else "") for v in visits.values()).most_common()))
    out.append("Devices: " + ", ".join(f"{k} {n}" for k, n in Counter(v["view"].get("dev", "?") for v in visits.values()).most_common()))
    out += ["", "Goals reached (share of visits)"]
    for label, hit in GOALS:
        n = sum(1 for v in visits.values() if hit(v["ev"]))
        out.append(f"  {label:33} {n} of {total}  ({round(100 * n / total)}%)")
    saves = Counter(s for v in visits.values() for s in v["saves"] if s)
    if saves:
        titles = _titles()
        out += ["", "Most added to plans"] + [f"  {n}x  {titles.get(k, k)}" for k, n in saves.most_common(10)]
    fb = [f for f in db.list_feedback() if f["created_at"] >= since]
    if fb:
        out += ["", f"Robot picks feedback: {sum(f['vote'] == 'up' for f in fb)} up, {sum(f['vote'] == 'down' for f in fb)} down"]
        out += [f"  {f['vote']:4}  {f['note']}" for f in fb if f["note"]]
    out += ["", f"Visits, newest first (up to {journeys})"]
    out += ["  " + _journey(v) for v in sorted(visits.values(), key=lambda v: v["start"], reverse=True)[:journeys]]
    return "\n".join(out)
