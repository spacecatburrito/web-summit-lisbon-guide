import json

from tests.test_parse import FakeClient, api  # noqa: F401 - api is a pytest fixture


def _ids(n):
    from app import sessions
    return [s["id"] for s in sessions.load_sessions()[:n]]


def test_rank_without_key_keeps_candidate_order(api):
    client, _, _ = api
    ids = _ids(12)
    r = client.post("/api/sessions", json={"text": "AI investors", "ids": ids})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "keywords"
    assert [p["id"] for p in body["picks"]] == ids[:8]


def test_rank_with_model_drops_unknown_ids_and_markup(api):
    from app import sessions
    ids = _ids(5)
    fake = FakeClient({"picks": [{"id": ids[2], "why": "Investors <b>here</b>【keynote】"}, {"id": "not-a-session", "why": "x"}], "summary": "Two <i>good</i> picks"})
    r = sessions.rank("AI investors", ids, client=fake)
    assert r["source"] == "llm"
    assert r["picks"] == [{"id": ids[2], "why": "Investors here"}]
    assert r["summary"] == "Two good picks"
    kw = fake.calls[0]
    assert kw["output_config"]["format"]["schema"]["properties"]["picks"]["items"]["properties"]["id"]["enum"] == sorted(ids)
    assert "<request>" in kw["messages"][0]["content"] and ids[0] in kw["messages"][0]["content"]


def test_rank_rejects_unknown_ids_and_too_many(api):
    client, _, _ = api
    assert client.post("/api/sessions", json={"text": "AI", "ids": ["nope"]}).status_code == 422
    assert client.post("/api/sessions", json={"text": "AI", "ids": _ids(41)}).status_code == 422
    assert client.post("/api/sessions", json={"text": " ", "ids": _ids(2)}).status_code == 422


def test_feedback_is_stored(api):
    client, _, _ = api
    from app import db
    r = client.post("/api/feedback", json={"kind": "sessions", "vote": "up", "note": "Great picks", "query": "AI investors", "ids": _ids(2)})
    assert r.status_code == 200 and r.json() == {"ok": True}
    rows = db.list_feedback()
    assert len(rows) == 1 and rows[0]["vote"] == "up" and rows[0]["note"] == "Great picks"
    assert json.loads(rows[0]["ids_json"]) == _ids(2)


def test_feedback_rejects_bad_vote(api):
    client, _, _ = api
    assert client.post("/api/feedback", json={"kind": "sessions", "vote": "meh"}).status_code == 422
