"""Environment-driven settings. Secrets come from /srv/ws26/.env on the server, never from the repo."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


DB_PATH = Path(_env("WS26_DB_PATH", str(ROOT / "data" / "leads.db")))
EVENTS_PATH = Path(_env("WS26_EVENTS_PATH", str(ROOT / "data" / "events.json")))
TIPS_PATH = Path(_env("WS26_TIPS_PATH", str(ROOT / "data" / "tips.json")))
SESSIONS_PATH = Path(_env("WS26_SESSIONS_PATH", str(EVENTS_PATH.parent / "sessions.json")))
PUBLIC_BASE_URL = _env("PUBLIC_BASE_URL", "https://tss.wtf/ws26").rstrip("/")
SMTP_HOST = _env("SMTP_HOST")
SMTP_PORT = int(_env("SMTP_PORT", "587"))
SMTP_USER = _env("SMTP_USER")
SMTP_PASSWORD = _env("SMTP_PASSWORD")
SMTP_FROM_EMAIL = _env("SMTP_FROM_EMAIL")
SMTP_FROM_NAME = _env("SMTP_FROM_NAME", "Elena, WS26 guide")
TELEGRAM_BOT_TOKEN = _env("TELEGRAM_BOT_TOKEN")
TELEGRAM_BOT_USERNAME = _env("TELEGRAM_BOT_USERNAME")
DEV_STATIC = _env("WS26_DEV_STATIC") == "1"
RATE_LIMIT_PER_HOUR = int(_env("WS26_RATE_LIMIT", "20"))
PARSE_LIMIT_PER_HOUR = int(_env("WS26_PARSE_LIMIT", "15"))
TRACK_LIMIT_PER_HOUR = int(_env("WS26_TRACK_LIMIT", "600"))
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
PARSE_MODEL = _env("WS26_PARSE_MODEL", "claude-sonnet-5-5")
PARSE_EFFORT = _env("WS26_PARSE_EFFORT", "low")
