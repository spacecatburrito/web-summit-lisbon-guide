import os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("WS26_EVENTS_PATH", str(ROOT / "data" / "events.json"))
# Synthetic programme: tests do not depend on the real Web Summit dump, which is not published.
os.environ.setdefault("WS26_SESSIONS_PATH", str(ROOT / "tests" / "fixtures" / "sessions.json"))
os.environ.setdefault("WS26_TIPS_PATH", str(ROOT / "data" / "tips.json"))
os.environ.setdefault("PUBLIC_BASE_URL", "https://tss.wtf/ws26")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "ws26guide_bot")
