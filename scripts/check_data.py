"""Validate data/events.json and data/tips.json before a data redeploy. Usage: python3 scripts/check_data.py"""
import json, re, sys
from collections import Counter
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
ACCESS = {"open", "register", "approval", "invite", "badge", "closed"}
THEMES = {"investors", "product", "regional", "women", "compliance", "careers"}
EM_DASH = "\u2014"


def main() -> int:
    events = json.loads((DATA / "events.json").read_text())
    tips = json.loads((DATA / "tips.json").read_text())
    errors = []
    ids = Counter(e["id"] for e in events)
    errors += [f"duplicate id {i}" for i, n in ids.items() if n > 1]
    for e in events:
        if not set(e["tags"].get("themes", [])) <= THEMES:
            errors.append(f"{e['id']}: bad themes {e['tags'].get('themes')}")
        if e["access"] not in ACCESS:
            errors.append(f"{e['id']}: bad access {e['access']}")
        if not (date(2026, 11, 7) <= date.fromisoformat(e["date"]) <= date(2026, 11, 14)):
            errors.append(f"{e['id']}: date out of range")
        if not e["url"].startswith("https://"):
            errors.append(f"{e['id']}: url")
        for t in ("start", "end"):
            if e[t] is not None and not re.fullmatch(r"\d\d:\d\d", e[t]):
                errors.append(f"{e['id']}: {t}")
        if EM_DASH in json.dumps(e, ensure_ascii=False):
            errors.append(f"{e['id']}: em dash")
    for t in tips:
        if len(t["text"]) > 240:
            errors.append(f"tip {t['id']}: too long")
        if EM_DASH in t["text"]:
            errors.append(f"tip {t['id']}: em dash")
    by_day = Counter(e["date"] for e in events)
    print(f"events: {len(events)}  tips: {len(tips)}  picks: {sum(e['elena_pick'] for e in events)}")
    print("per day: " + ", ".join(f"{d[5:]}={n}" for d, n in sorted(by_day.items())))
    print("access: " + ", ".join(f"{k}={n}" for k, n in Counter(e["access"] for e in events).items()))
    print("verified_on: " + ", ".join(sorted({e["verified_on"] for e in events})))
    for err in errors:
        print("ERROR", err)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
