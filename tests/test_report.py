import json
from datetime import datetime, timezone

from tests.test_parse import api  # noqa: F401 - api is a pytest fixture
from tests.test_track import _hit


def test_report_shows_goal_funnel_top_saves_and_each_visit(api):
    client, _, _ = api
    from app import db, report, sessions, settings
    sid = sessions.load_sessions()[0]["id"]
    a = {"v": "visitAAAAAAA"}
    _hit(client, "view", {"src": "linkedin", "camp": "li-launch", "dev": "mobile", "tab": "side-events"}, **a)
    _hit(client, "filter", {"k": "web3"}, **a)
    _hit(client, "find", {"k": "all"}, **a)
    _hit(client, "plan", {"id": "ws-first-timers"}, **a)
    _hit(client, "plan", {"id": f"s:{sid}"}, **a)
    _hit(client, "tab", {"tab": "plan"}, **a)
    _hit(client, "export", {"k": "calendar"}, **a)
    _hit(client, "click", {"to": "telegram"}, **a)
    _hit(client, "time", {"s": "200"}, **a)
    _hit(client, "view", {"src": "direct", "dev": "desktop", "tab": "side-events"}, v="visitBBBBBBB", **{"user-agent": "UA-2"})
    _hit(client, "time", {"s": "10"}, v="visitBBBBBBB", **{"user-agent": "UA-2"})
    db.save_feedback("sessions", "up", "Great picks", "AI investors", [sid])

    text = report.usage_report(days=1, now=datetime.now(timezone.utc))

    assert "2 visits by 2 people" in text
    assert "Added something to the plan       1 of 2  (50%)" in text
    assert "Exported or sent the plan         1 of 2  (50%)" in text
    assert "Wrote to Elena                    1 of 2  (50%)" in text
    first_timers = next(e["title"] for e in json.load(open(settings.EVENTS_PATH)) if e["id"] == "ws-first-timers")
    assert f"1x  {first_timers}" in text
    assert "Great picks" in text
    journey = next(line for line in text.splitlines() if "li-launch" in line and "mobile" in line)
    assert "3m20s" in journey and "+2 to plan" in journey and "exported calendar" in journey and "wrote on Telegram" in journey
