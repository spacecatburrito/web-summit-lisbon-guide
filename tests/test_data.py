import json, re
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
EVENT_KEYS = {"id","title","host","date","start","end","venue","address","area","url","price","access",
              "needs_badge","tags","note","verified_on","elena_pick"}
TAG_KEYS = {"audience","sectors","goals","communities","vibe","themes"}
ACCESS = {"open","register","approval","invite","badge","closed"}
AUDIENCE = {"founder","product","investor","sales","recruiter","corporate","other"}
GOALS = {"hire","get_hired","cofounder","raise","sell","learn","party"}
SECTORS = {"fintech","crypto","ai","saas","consumer","any"}
COMMUNITIES = {"ru","latam","women","crypto_biz","any"}
VIBE = {"talk","networking","party","breakfast","dinner","workshop"}
THEMES = {"investors","product","women","regional","compliance","careers"}
EM_DASH = "\u2014"

def load(name):
    return json.loads((DATA / name).read_text())

def strings(obj):
    if isinstance(obj, str): yield obj
    elif isinstance(obj, dict):
        for v in obj.values(): yield from strings(v)
    elif isinstance(obj, list):
        for v in obj: yield from strings(v)

def test_events_schema():
    for e in load("events.json"):
        assert set(e) == EVENT_KEYS, (e.get("id"), set(e) ^ EVENT_KEYS)
        assert set(e["tags"]) == TAG_KEYS, e["id"]
        assert e["access"] in ACCESS, e["id"]
        assert date(2026,11,7) <= date.fromisoformat(e["date"]) <= date(2026,11,14), e["id"]
        assert e["url"].startswith("https://"), e["id"]
        assert isinstance(e["needs_badge"], bool) and isinstance(e["elena_pick"], bool), e["id"]
        for t in ("start","end"):
            assert e[t] is None or re.fullmatch(r"\d\d:\d\d", e[t]), (e["id"], t)
        assert set(e["tags"]["audience"]) <= AUDIENCE, e["id"]
        assert set(e["tags"]["goals"]) <= GOALS, e["id"]
        assert set(e["tags"]["sectors"]) <= SECTORS, e["id"]
        assert set(e["tags"]["communities"]) <= COMMUNITIES, e["id"]
        assert e["tags"]["vibe"] in VIBE, e["id"]
        assert set(e["tags"]["themes"]) <= THEMES, e["id"]
        date.fromisoformat(e["verified_on"])
        assert not any(EM_DASH in s for s in strings(e)), e["id"]

def test_no_duplicate_ids():
    ids = [e["id"] for e in load("events.json")]
    assert len(ids) == len(set(ids))
    tids = [t["id"] for t in load("tips.json")]
    assert len(tids) == len(set(tids))

def test_tips_schema():
    for t in load("tips.json"):
        assert set(t) == {"id","text","tags","source"}, t.get("id")
        assert 0 < len(t["text"]) <= 240, t["id"]
        assert t["source"], t["id"]
        assert t["tags"], t["id"]
        assert EM_DASH not in t["text"], t["id"]

def test_min_counts():
    assert len(load("events.json")) >= 40
    assert len(load("tips.json")) >= 20

def test_every_theme_has_events():
    side = [e for e in load("events.json") if not e["id"].startswith("ws-")]
    for t in THEMES:
        assert any(t in e["tags"]["themes"] for e in side), t

def test_official_meetups_open_in_the_web_summit_app():
    for e in load("events.json"):
        if e["id"].startswith("ws-") and e["id"] != "ws-night-summit":
            assert re.fullmatch(r"https://attend\.websummit\.com/dl/lis26/event\?id=[0-9a-f-]{36}", e["url"]), e["id"]
