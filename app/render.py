"""Plan rendering for email, Telegram and the shareable page. Plain HTML, no external CSS."""
import html
import json
from datetime import date
from functools import lru_cache

from . import settings

DAY_NAMES = {"2026-11-08": "Sunday", "2026-11-09": "Monday", "2026-11-10": "Tuesday", "2026-11-11": "Wednesday", "2026-11-12": "Thursday", "2026-11-13": "Friday"}
ACCESS_LABEL = {"open": "open", "register": "register", "approval": "approval needed", "invite": "invite only", "badge": "badge needed", "closed": "closed"}
LINKS = [("Meet me in the Web Summit app", "https://attend.websummit.com/dl/lis26/attendee?id=5ab99571-74f8-4c2a-b746-0ee85591b042"), ("LinkedIn", "https://www.linkedin.com/in/elenashiltseva"), ("Telegram", "https://t.me/Lena_is_NEAR")]
ELENA = "Made by Elena, product leader in fintech and crypto, building with AI every day. In Lisbon all week and up for a 15-minute coffee at the venue."
LDA = "Your business receives crypto or moves money across borders? My husband Ricardo runs a Lisbon crypto-to-EUR desk and is doing 30-minute research interviews this month, no pitch. Message me on Telegram and I will connect you."


@lru_cache(maxsize=1)
def load_events() -> dict[str, dict]:
    return {e["id"]: e for e in json.loads(settings.EVENTS_PATH.read_text())}


@lru_cache(maxsize=1)
def load_tips() -> dict[str, dict]:
    return {t["id"]: t for t in json.loads(settings.TIPS_PATH.read_text())}


def _day_label(d: str) -> str:
    dt = date.fromisoformat(d)
    return f"{DAY_NAMES.get(d, dt.strftime('%A'))} {dt.day} Nov"


def _grouped(plan_ids: list[str]) -> list[tuple[str, list[dict]]]:
    events = load_events()
    rows = sorted((events[i] for i in plan_ids if i in events), key=lambda e: (e["date"], e["start"] or ""))
    out: dict[str, list[dict]] = {}
    for e in rows:
        out.setdefault(e["date"], []).append(e)
    return list(out.items())


def _when(e: dict) -> str:
    if not e["start"]:
        return "all day"
    return f"{e['start']}-{e['end']}" if e["end"] else e["start"]


def _where(e: dict) -> str:
    venue = e["venue"] if e["venue"] and e["venue"] != "See event page" else ""
    if venue.lower().startswith(e["host"].lower()):
        venue = venue[len(e["host"]):].strip(" ,") 
    parts = [venue, e["area"]]
    return ", ".join(p for p in parts if p)


def _flags(e: dict) -> str:
    f = [ACCESS_LABEL[e["access"]]]
    if e["price"] != "free":
        f.append(e["price"])
    return ", ".join(f)


def plan_text(plan: dict, show_lda: bool | None = None) -> str:
    show_lda = _lda(plan) if show_lda is None else show_lda
    lines = ["Your Web Summit 2026 week", ""]
    for d, evs in _grouped(plan["plan_ids"]):
        lines.append(_day_label(d))
        for e in evs:
            lines.append(f"  {_when(e)}  {e['title']}")
            lines.append(f"    {e['host']}" + (f", {_where(e)}" if _where(e) else "") + f". {_flags(e)}.")
            lines.append(f"    {e['url']}")
        lines.append("")
    tips = load_tips()
    picked = [tips[i] for i in plan.get("tip_ids", []) if i in tips]
    if picked:
        lines.append("Lifehacks")
        lines += [f"  - {t['text']}" for t in picked]
        lines.append("")
    lines.append(f"Your plan online: {settings.PUBLIC_BASE_URL}/p/{plan['id']}")
    lines.append("Confirm times and access on each event page; hosts change things.")
    lines.append("")
    lines.append(ELENA)
    lines += [f"{name}: {url}" for name, url in LINKS]
    if show_lda:
        lines += ["", LDA]
    return "\n".join(lines)


def plan_html(plan: dict, show_lda: bool | None = None) -> str:
    show_lda = _lda(plan) if show_lda is None else show_lda
    h = html.escape
    parts = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>",
        "<title>Your Web Summit 2026 week</title>",
        "<style>body{margin:0;padding:24px 16px 48px;font:16px/1.5 Inter,system-ui,sans-serif;color:#191b21;background:#fff;max-width:640px;margin:0 auto}",
        "h1{font-size:30px;margin:0 0 6px}h2{font-size:20px;margin:22px 0 6px;border-top:1px solid #e3e5ee;padding-top:14px}",
        ".ev{margin:0 0 12px}.t{font-weight:600}.m{color:#565a68;font-size:14px}.n{font-size:14px}a{color:#3b39a6}",
        ".foot{color:#8b8f9e;font-size:13px;margin-top:28px;border-top:1px solid #e3e5ee;padding-top:12px}.links a{margin-right:12px}</style></head><body>",
        "<h1>Your Web Summit 2026 week</h1>",
        f"<p class='m'>Plan {h(plan['id'])}. Confirm times and access on each event page; hosts change things.</p>",
    ]
    for d, evs in _grouped(plan["plan_ids"]):
        parts.append(f"<h2>{h(_day_label(d))}</h2>")
        for e in evs:
            where = _where(e)
            parts.append(
                f"<div class='ev'><div class='t'>{h(_when(e))} <a href='{h(e['url'])}'>{h(e['title'])}</a></div>"
                f"<div class='m'>{h(e['host'])}{(', ' + h(where)) if where else ''}. {h(_flags(e))}.</div>"
                f"<div class='n'>{h(e['note'])}</div></div>"
            )
    tips = load_tips()
    picked = [tips[i] for i in plan.get("tip_ids", []) if i in tips]
    if picked:
        parts.append("<h2>Lifehacks</h2><ul>" + "".join(f"<li>{h(t['text'])}</li>" for t in picked) + "</ul>")
    parts.append(f"<p class='foot'>{h(ELENA)}</p><p class='links'>" + " ".join(f"<a href='{u}'>{h(n)}</a>" for n, u in LINKS) + "</p>")
    if show_lda:
        parts.append(f"<p class='foot'>{h(LDA)}</p>")
    parts.append("</body></html>")
    return "".join(parts)


def _lda(plan: dict) -> bool:
    return "crypto_biz" in (plan.get("answers", {}).get("groups") or [])
