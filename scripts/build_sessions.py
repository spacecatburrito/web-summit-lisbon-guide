"""Turn a raw Web Summit schedule dump into data/sessions.json for the "Find sessions" box.

Usage: python3 scripts/build_sessions.py data/raw/schedule-YYYY-MM-DD.json

The raw dump is collected in a normal browser on websummit.com/schedule (the page's own /api/list-items calls,
one format at a time). Times in the dump are UTC; Lisbon is UTC+0 in November, so they are used as local time.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_FORMATS = {"Press conference"}
EM_DASH = chr(0x2014)
# Pictographs, flags, variation selectors and joiners: iOS draws them as colour emoji inside our type.
EMOJI = re.compile(r"[\U0001F000-\U0001FAFF\U000E0000-\U000E007F\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200B-\u200D]")


def clean(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", EMOJI.sub("", (s or "").replace(EM_DASH, " - "))).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def main(raw_path: str) -> None:
    raw = json.loads(Path(raw_path).read_text())
    out = []
    for s in raw:
        if s["format"] in SKIP_FORMATS or not s.get("starts_at"):
            continue
        out.append({
            "id": s["id"],
            "title": clean(s["title"], 160),
            "desc": clean(s.get("description", ""), 280),
            "date": s["starts_at"][:10],
            "start": s["starts_at"][11:16],
            "end": (s.get("ends_at") or "")[11:16] or None,
            "loc": clean(s.get("location") or "", 60),
            "track": clean(s.get("track") or "", 60),
            "format": s["format"],
            "speakers": [clean(f"{p['name']}, {p['company']}" if p.get("company") else p["name"], 80) for p in s.get("speakers", [])[:4]],
            "url": f"https://websummit.com/sessions/lis26/{s['id']}/{s['slug']}/",
        })
    out.sort(key=lambda x: (x["date"], x["start"], x["title"]))
    dest = ROOT / "data" / "sessions.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(dest, len(out), "sessions", dest.stat().st_size, "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
