import importlib
import pytest


@pytest.fixture
def mods(tmp_path, monkeypatch):
    monkeypatch.setenv("WS26_DB_PATH", str(tmp_path / "leads.db"))
    from app import settings as s, db, bot
    importlib.reload(s); importlib.reload(db); importlib.reload(bot)
    return db, bot


ANS = {"role": "founder", "goal": "raise", "sector": "crypto", "badge": "yes", "days": ["d11"], "evenings": "party", "groups": ["crypto_biz"]}


def test_start_valid_token_returns_plan_and_attaches_chat(mods):
    db, bot = mods
    lead = db.create_lead("telegram", None, ANS, ["fintech-breakfast"], ["badge-airport"])
    text = bot.handle_start(lead, chat_id=42, username="ana")
    assert "Fintech Exclusive Breakfast" in text and "luma.com/ljzx2ril" in text
    assert "Ricardo" in text
    row = db.get_plan(lead)
    assert row["tg_chat_id"] == 42 and row["tg_user"] == "ana" and row["sent_ok"] == 1


def test_start_unknown_token_help_text(mods):
    _, bot = mods
    text = bot.handle_start("nope", chat_id=1, username=None)
    assert "tss.wtf/ws26" in text and "Fintech" not in text


def test_start_reused_token_same_chat_ok_other_chat_help(mods):
    db, bot = mods
    lead = db.create_lead("telegram", None, ANS, ["fintech-breakfast"], [])
    assert "Fintech Exclusive Breakfast" in bot.handle_start(lead, chat_id=7, username="a")
    assert "Fintech Exclusive Breakfast" in bot.handle_start(lead, chat_id=7, username="a")
    other = bot.handle_start(lead, chat_id=8, username="b")
    assert "Fintech" not in other and "tss.wtf/ws26" in other


def test_empty_start_gives_help(mods):
    _, bot = mods
    assert "tss.wtf/ws26" in bot.handle_start("", chat_id=1, username=None)
