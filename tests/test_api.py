import json
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("WS26_DB_PATH", str(tmp_path / "leads.db"))
    import importlib
    from app import settings as s, db, main, mailer
    importlib.reload(s); importlib.reload(db); importlib.reload(main)
    sent = []
    monkeypatch.setattr(main.mailer, "send_plan", lambda to, html, text: sent.append((to, html, text)))
    main.RATE.clear()
    return TestClient(main.app), sent, db


ANS = {"role": "product", "goal": "get_hired", "sector": "fintech", "badge": "no", "days": ["d10", "d11"], "evenings": "drinks", "groups": ["ru"]}
BODY = {"channel": "email", "contact": " Ana@X.com ", "answers": ANS, "plan_ids": ["fintech-breakfast", "ai-in-the-palace"], "tip_ids": ["badge-airport"]}


def test_health(api):
    c, _, _ = api
    assert c.get("/api/health").json()["ok"] is True


def test_email_normalised_and_sent(api):
    c, sent, db = api
    r = c.post("/api/plan", json=BODY)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["sent_ok"] is True and data["url"].startswith("https://tss.wtf/ws26/p/")
    assert sent[0][0] == "ana@x.com"
    assert "Fintech Exclusive Breakfast" in sent[0][2]
    assert db.get_plan(data["id"])["contact"] == "ana@x.com"


def test_bad_email_422(api):
    c, _, _ = api
    assert c.post("/api/plan", json={**BODY, "contact": "ana@x"}).status_code == 422


def test_unknown_option_422(api):
    c, _, _ = api
    assert c.post("/api/plan", json={**BODY, "answers": {**ANS, "role": "wizard"}}).status_code == 422
    assert c.post("/api/plan", json={**BODY, "plan_ids": ["not-an-event"]}).status_code == 422


def test_smtp_failure_returns_url_and_stores_error(api, monkeypatch):
    c, _, db = api
    from app import main
    def boom(to, html, text): raise RuntimeError("smtp down")
    monkeypatch.setattr(main.mailer, "send_plan", boom)
    r = c.post("/api/plan", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["sent_ok"] is False and data["url"]
    row = db.get_plan(data["id"])
    assert row["sent_ok"] == 0 and "smtp down" in row["error"]


def test_plan_page_renders_event_titles(api):
    c, _, _ = api
    pid = c.post("/api/plan", json=BODY).json()["id"]
    r = c.get(f"/p/{pid}")
    assert r.status_code == 200
    assert "Fintech Exclusive Breakfast" in r.text and "AI in the Palace" in r.text
    assert "—" not in r.text
    assert c.get("/p/nope").status_code == 404


def test_telegram_channel_returns_start_url(api):
    c, sent, _ = api
    r = c.post("/api/plan", json={**BODY, "channel": "telegram", "contact": None})
    assert r.status_code == 200
    data = r.json()
    assert data["tg_start_url"] == f"https://t.me/ws26guide_bot?start={data['id']}"
    assert sent == []


def test_rate_limit_21st_request_429(api):
    c, _, _ = api
    for _ in range(20):
        assert c.post("/api/plan", json=BODY).status_code == 200
    assert c.post("/api/plan", json=BODY).status_code == 429
