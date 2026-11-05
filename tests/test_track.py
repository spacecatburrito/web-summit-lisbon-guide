import json
from datetime import datetime, timezone

from tests.test_parse import api  # noqa: F401 - api is a pytest fixture


def _hit(client, e, p=None, v="abc123def456", **headers):
    return client.post("/api/t", json={"v": v, "e": e, "p": p or {}}, headers={"user-agent": "UA-1", **headers})


def test_hit_stores_event_without_ip_or_user_agent(api):
    client, _, _ = api
    from app import db
    assert _hit(client, "view", {"tab": "side-events", "src": "linkedin", "camp": "li-launch", "dev": "mobile"}).status_code == 204
    rows = db.list_hits()
    assert len(rows) == 1 and rows[0]["event"] == "view" and rows[0]["visit"] == "abc123def456"
    assert json.loads(rows[0]["props_json"]) == {"tab": "side-events", "src": "linkedin", "camp": "li-launch", "dev": "mobile"}
    stored = json.dumps(rows[0])
    assert "testclient" not in stored and "UA-1" not in stored and len(rows[0]["uid"]) == 16


def test_unknown_events_and_extra_props_are_dropped(api):
    client, _, _ = api
    from app import db
    assert _hit(client, "steal", {"x": "1"}).status_code == 422
    _hit(client, "click", {"to": "telegram", "email": "a@b.c", "huge": "y" * 500})
    assert json.loads(db.list_hits()[0]["props_json"]) == {"to": "telegram"}


def test_same_visitor_same_day_shares_uid_other_browser_does_not(api):
    client, _, _ = api
    from app import db
    _hit(client, "view", v="visit0000001")
    _hit(client, "view", v="visit0000002")
    _hit(client, "view", v="visit0000003", **{"user-agent": "UA-2"})
    uids = [r["uid"] for r in db.list_hits()]
    assert uids[0] == uids[1] != uids[2]


def test_stats_summarise_visits_sources_tabs_time_and_clicks(api):
    client, _, _ = api
    from app import db
    _hit(client, "view", {"src": "linkedin", "camp": "li-launch", "dev": "mobile"}, v="visitAAAAAAA")
    _hit(client, "tab", {"tab": "summit"}, v="visitAAAAAAA")
    _hit(client, "time", {"s": "40"}, v="visitAAAAAAA")
    _hit(client, "time", {"s": "95"}, v="visitAAAAAAA")
    _hit(client, "click", {"to": "telegram"}, v="visitAAAAAAA")
    _hit(client, "view", {"src": "direct", "dev": "desktop"}, v="visitBBBBBBB", **{"user-agent": "UA-2"})
    s = db.hit_stats(days=1, now=datetime.now(timezone.utc))
    assert s["visits"] == 2 and s["visitors"] == 2
    assert s["sources"] == {"linkedin / li-launch": 1, "direct": 1}
    assert s["tabs"] == {"summit": 1}
    assert s["clicks"] == {"telegram": 1}
    assert s["active_seconds_median"] == 47  # visits 95 s and 0 s


def test_tracking_rate_limited(api):
    client, _, main = api
    main.settings.TRACK_LIMIT_PER_HOUR = 3
    codes = [_hit(client, "view").status_code for _ in range(4)]
    assert codes == [204, 204, 204, 429]
