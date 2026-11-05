import json

from tests.test_parse import api  # noqa: F401 - api is a pytest fixture


def _events():
    from app import settings
    return json.loads(settings.EVENTS_PATH.read_text(encoding="utf-8"))


def test_plan_ics_is_a_calendar_file_with_every_known_item_in_time_order(api):
    client, _, _ = api
    from app import sessions
    ev = [e for e in _events() if e.get("start")][:2]
    s = sessions.load_sessions()[0]
    ids = ",".join([ev[1]["id"], f"s:{s['id']}", "not-an-event", ev[0]["id"]])
    r = client.get("/api/plan.ics", params={"ids": ids, "going": ev[0]["id"]})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert 'filename="my-web-summit-plan.ics"' in r.headers["content-disposition"]
    body = r.text
    assert body.startswith("BEGIN:VCALENDAR\r\n") and body.endswith("END:VCALENDAR\r\n")
    assert body.count("BEGIN:VEVENT") == 3
    starts = [line for line in body.split("\r\n") if line.startswith("DTSTART:")]
    assert starts == sorted(starts)
    assert f"UID:session-{s['id']}@tss.wtf" in body
    assert f"https://attend.websummit.com/dl/lis26/event?id={s['id']}" in body.replace("\r\n ", "")
    assert "Status: going" in body.replace("\r\n ", "")
    assert all(len(line.encode()) <= 75 for line in body.split("\r\n"))


def test_plan_ics_runs_past_midnight_and_defaults_to_three_hours(api):
    from app import ics
    late = {"id": "x", "title": "Late, party; fun", "date": "2026-11-10", "start": "22:00", "end": "02:00", "url": "https://e.x"}
    open_end = {"id": "y", "title": "Open", "date": "2026-11-11", "start": "19:00", "url": "https://e.x"}
    body = ics.plan_ics([("event", late), ("event", open_end)], {})
    assert "DTEND:20261111T020000Z" in body and "DTEND:20261111T220000Z" in body
    assert r"SUMMARY:Late\, party\; fun" in body


def test_plan_ics_rejects_empty_or_oversized_requests(api):
    client, _, _ = api
    assert client.get("/api/plan.ics", params={"ids": ""}).status_code == 422
    assert client.get("/api/plan.ics", params={"ids": "nope"}).status_code == 404
    assert client.get("/api/plan.ics", params={"ids": ",".join(["a"] * 201)}).status_code == 422
