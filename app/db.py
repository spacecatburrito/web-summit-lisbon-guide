"""SQLite storage: leads, session-finder feedback and anonymous usage hits. Stdlib only."""
import json
import secrets
import sqlite3
import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone

from . import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  contact TEXT,
  tg_chat_id INTEGER,
  tg_user TEXT,
  answers_json TEXT NOT NULL,
  plan_ids_json TEXT NOT NULL,
  tip_ids_json TEXT NOT NULL DEFAULT '[]',
  sent_ok INTEGER,
  error TEXT,
  query TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  vote TEXT NOT NULL,
  note TEXT,
  query TEXT,
  ids_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  visit TEXT NOT NULL,
  uid TEXT NOT NULL,
  event TEXT NOT NULL,
  props_json TEXT NOT NULL DEFAULT '{}'
);
"""


def connect() -> sqlite3.Connection:
    settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(settings.DB_PATH)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    cols = {r[1] for r in con.execute("PRAGMA table_info(leads)")}
    if "query" not in cols:  # databases created before the free-text mode
        con.execute("ALTER TABLE leads ADD COLUMN query TEXT")
    return con


def create_lead(channel: str, contact: str | None, answers: dict, plan_ids: list[str], tip_ids: list[str] | None = None, query: str | None = None) -> str:
    lead_id = secrets.token_urlsafe(8)[:10]
    with connect() as con:
        con.execute(
            "INSERT INTO leads (id, created_at, channel, contact, answers_json, plan_ids_json, tip_ids_json, query) VALUES (?,?,?,?,?,?,?,?)",
            (lead_id, datetime.now(timezone.utc).isoformat(timespec="seconds"), channel, contact,
             json.dumps(answers), json.dumps(plan_ids), json.dumps(tip_ids or []), query),
        )
    return lead_id


def mark_sent(lead_id: str, ok: bool, error: str | None = None) -> None:
    with connect() as con:
        con.execute("UPDATE leads SET sent_ok=?, error=? WHERE id=?", (1 if ok else 0, error, lead_id))


def attach_tg(lead_id: str, chat_id: int, username: str | None) -> None:
    with connect() as con:
        con.execute("UPDATE leads SET tg_chat_id=?, tg_user=?, sent_ok=1, error=NULL WHERE id=?", (chat_id, username, lead_id))


def get_plan(lead_id: str) -> dict | None:
    with connect() as con:
        row = con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    if row is None:
        return None
    d = dict(row)
    d["answers"] = json.loads(d.pop("answers_json"))
    d["plan_ids"] = json.loads(d.pop("plan_ids_json"))
    d["tip_ids"] = json.loads(d.pop("tip_ids_json"))
    return d


def save_feedback(kind: str, vote: str, note: str | None, query: str | None, ids: list[str]) -> None:
    with connect() as con:
        con.execute("INSERT INTO feedback (created_at, kind, vote, note, query, ids_json) VALUES (?,?,?,?,?,?)",
                    (datetime.now(timezone.utc).isoformat(timespec="seconds"), kind, vote, note, query, json.dumps(ids)))


def list_feedback() -> list[dict]:
    with connect() as con:
        rows = con.execute("SELECT * FROM feedback ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def save_hit(visit: str, uid: str, event: str, props: dict) -> None:
    with connect() as con:
        con.execute("INSERT INTO hits (ts, visit, uid, event, props_json) VALUES (?,?,?,?,?)",
                    (datetime.now(timezone.utc).isoformat(timespec="seconds"), visit, uid, event, json.dumps(props)))


def list_hits() -> list[dict]:
    with connect() as con:
        rows = con.execute("SELECT * FROM hits ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def hit_stats(days: int = 7, now: datetime | None = None) -> dict:
    """Usage summary for the last `days` days: visits, visitors, sources, devices, tabs, sections, time, actions, clicks."""
    since = ((now or datetime.now(timezone.utc)) - timedelta(days=days)).isoformat(timespec="seconds")
    with connect() as con:
        rows = [dict(r) | {"p": json.loads(r["props_json"])} for r in con.execute("SELECT * FROM hits WHERE ts >= ? ORDER BY id", (since,))]
    views = [r for r in rows if r["event"] == "view"]
    first_view = {}
    for r in views:
        first_view.setdefault(r["visit"], r)
    per_day = Counter(r["ts"][:10] for r in first_view.values())
    uniq_day = {d: len({r["uid"] for r in views if r["ts"][:10] == d}) for d in per_day}
    distinct = lambda ev, key: Counter(k for k in {(r["visit"], r["p"].get(key)) for r in rows if r["event"] == ev and r["p"].get(key)} for k in [k[1]])  # noqa: E731
    secs = {v: 0 for v in first_view}
    for r in rows:
        if r["event"] == "time" and r["visit"] in secs:
            secs[r["visit"]] = max(secs[r["visit"]], int(r["p"].get("s", "0") or 0))
    return {
        "visits": len(first_view),
        "visitors": len({r["uid"] for r in views}),
        "by_day": {d: {"visits": per_day[d], "visitors": uniq_day[d]} for d in sorted(per_day)},
        "sources": dict(Counter(r["p"].get("src", "direct") + (f" / {r['p']['camp']}" if r["p"].get("camp") else "") for r in first_view.values())),
        "devices": dict(Counter(r["p"].get("dev", "?") for r in first_view.values())),
        "tabs": dict(distinct("tab", "tab")),
        "sections": dict(distinct("section", "id")),
        "active_seconds_median": int(statistics.median(secs.values())) if secs else 0,
        "active_seconds_by_visit": sorted(secs.values(), reverse=True)[:20],
        "actions": dict(Counter(r["event"] for r in rows if r["event"] in ("ask", "find", "plan", "vote", "faq", "todo", "filter", "kind", "export", "status"))),
        "clicks": dict(Counter(r["p"].get("to") for r in rows if r["event"] == "click" and r["p"].get("to"))),
    }


def list_leads() -> list[dict]:
    with connect() as con:
        rows = con.execute("SELECT * FROM leads ORDER BY created_at").fetchall()
    return [dict(r) for r in rows]
