"""FastAPI service: POST /api/plan, GET /p/{id}, GET /api/health. Runs behind Caddy on 127.0.0.1:8006."""
import asyncio
import hashlib
import logging
import re
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from . import db, ics, mailer, parse, render, sessions, settings
from .quiz_options import validate_answers

log = logging.getLogger("ws26")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
RATE: dict[str, deque] = defaultdict(deque)
PARSE_RATE: dict[str, deque] = defaultdict(deque)
SESSIONS_RATE: dict[str, deque] = defaultdict(deque)
TRACK_RATE: dict[str, deque] = defaultdict(deque)
# Anonymous usage stats: an allowlist of events and short property values; no IP, user agent or text is stored.
# Visitors are counted by sha256(daily salt + IP + user agent); the salt lives in memory for one day only.
TRACK_EVENTS = {"view", "tab", "section", "time", "click", "ask", "find", "plan", "vote", "faq", "todo", "filter", "kind", "export", "status"}
TRACK_PROPS = {"tab", "src", "camp", "dev", "ref", "id", "s", "to", "n", "k"}
DAILY_SALT: dict[str, str] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    if settings.TELEGRAM_BOT_TOKEN:
        from . import bot
        task = asyncio.create_task(bot.run_bot(settings.TELEGRAM_BOT_TOKEN))
    yield
    if task:
        task.cancel()


app = FastAPI(title="ws26-guide", docs_url=None, redoc_url=None, lifespan=lifespan)


class PlanIn(BaseModel):
    channel: str = Field(pattern="^(email|telegram)$")
    contact: str | None = None
    answers: dict
    plan_ids: list[str] = Field(max_length=12)
    tip_ids: list[str] = Field(default_factory=list, max_length=8)
    query: str | None = Field(default=None, max_length=600)


class ParseIn(BaseModel):
    text: str = Field(max_length=600)


class SessionsIn(BaseModel):
    text: str = Field(max_length=600)
    ids: list[str] = Field(max_length=sessions.MAX_CANDIDATES)


class HitIn(BaseModel):
    v: str = Field(pattern="^[A-Za-z0-9]{8,16}$")
    e: str = Field(max_length=16)
    p: dict = Field(default_factory=dict)


class FeedbackIn(BaseModel):
    kind: str = Field(pattern="^(sessions|events)$")
    vote: str = Field(pattern="^(up|down)$")
    note: str | None = Field(default=None, max_length=1000)
    query: str | None = Field(default=None, max_length=600)
    ids: list[str] = Field(default_factory=list, max_length=20)


def _client_ip(req: Request) -> str:
    return req.headers.get("x-forwarded-for", req.client.host if req.client else "?").split(",")[0].strip()


def _rate_ok(ip: str, bucket: dict | None = None, limit: int | None = None) -> bool:
    now = time.time()
    q = (RATE if bucket is None else bucket)[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= (settings.RATE_LIMIT_PER_HOUR if limit is None else limit):
        return False
    q.append(now)
    return True


@app.get("/api/plan.ics")
def plan_ics(ids: str = "", going: str = "", applied: str = ""):
    """My plan as a calendar file. Ids only, no visitor data: the browser holds the plan and puts it in the link."""
    wanted = [i for i in ids.split(",") if i][: ics.MAX_ITEMS + 1]
    if not wanted or len(wanted) > ics.MAX_ITEMS:
        raise HTTPException(422, "ids: 1 to 200 comma-separated plan ids")
    entries = ics.entries_for(wanted)
    if not entries:
        raise HTTPException(404, "none of these ids are in the guide")
    status = {i: "applied" for i in applied.split(",") if i} | {i: "going" for i in going.split(",") if i}
    return Response(ics.plan_ics(entries, status), media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="my-web-summit-plan.ics"', "Cache-Control": "no-store"})


@app.get("/api/health")
def health():
    return {"ok": True, "telegram": bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_BOT_USERNAME)}


@app.post("/api/parse")
def parse_text(body: ParseIn, req: Request):
    text = body.text.strip()
    if not text:
        raise HTTPException(422, ["empty text"])
    if not _rate_ok(_client_ip(req), PARSE_RATE, settings.PARSE_LIMIT_PER_HOUR):
        raise HTTPException(429, "Too many requests from this address; try the quiz or come back in an hour.")
    return parse.parse_query(text)


@app.post("/api/sessions")
def rank_sessions(body: SessionsIn, req: Request):
    text = body.text.strip()
    known = sessions.by_id()
    ids = list(dict.fromkeys(body.ids))
    if not text or not ids or any(i not in known for i in ids):
        raise HTTPException(422, ["empty text or unknown sessions"])
    if not _rate_ok(_client_ip(req), SESSIONS_RATE, settings.PARSE_LIMIT_PER_HOUR):
        raise HTTPException(429, "Too many requests from this address; come back in an hour.")
    return sessions.rank(text, ids)


def _uid(req: Request) -> str:
    day = time.strftime("%Y-%m-%d", time.gmtime())
    if day not in DAILY_SALT:
        DAILY_SALT.clear()
        DAILY_SALT[day] = secrets.token_hex(16)
    raw = f"{DAILY_SALT[day]}|{_client_ip(req)}|{req.headers.get('user-agent', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


@app.post("/api/t", status_code=204)
def track(body: HitIn, req: Request):
    if body.e not in TRACK_EVENTS:
        raise HTTPException(422, ["unknown event"])
    if not _rate_ok(_client_ip(req), TRACK_RATE, settings.TRACK_LIMIT_PER_HOUR):
        raise HTTPException(429, "Too many events.")
    props = {k: re.sub(r"[^\w .:/-]", "", str(v))[:40] for k, v in body.p.items() if k in TRACK_PROPS and len(str(v)) <= 40}
    db.save_hit(body.v, _uid(req), body.e, props)


@app.post("/api/feedback")
def feedback(body: FeedbackIn, req: Request):
    if not _rate_ok(_client_ip(req)):
        raise HTTPException(429, "Too many requests from this address; try again in an hour.")
    db.save_feedback(body.kind, body.vote, (body.note or "").strip() or None, (body.query or "").strip() or None, body.ids)
    return {"ok": True}


@app.post("/api/plan")
def create_plan(body: PlanIn, req: Request):
    if not _rate_ok(_client_ip(req)):
        raise HTTPException(429, "Too many requests from this address; try again in an hour.")
    problems = validate_answers(body.answers)
    events = render.load_events()
    unknown = [i for i in body.plan_ids if i not in events]
    if unknown:
        problems.append(f"unknown events {unknown}")
    contact = None
    if body.channel == "email":
        contact = (body.contact or "").strip().lower()
        if not EMAIL_RE.match(contact):
            problems.append("bad email")
    if problems:
        raise HTTPException(422, problems)
    lead_id = db.create_lead(body.channel, contact, body.answers, body.plan_ids, body.tip_ids, (body.query or "").strip() or None)
    plan = db.get_plan(lead_id)
    url = f"{settings.PUBLIC_BASE_URL}/p/{lead_id}"
    if body.channel == "telegram":
        return {"id": lead_id, "url": url, "sent_ok": False, "tg_start_url": f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={lead_id}"}
    try:
        mailer.send_plan(contact, render.plan_html(plan), render.plan_text(plan))
    except Exception as exc:  # noqa: BLE001 - any delivery failure is reported the same way
        log.warning("email delivery failed for %s: %s", lead_id, exc)
        db.mark_sent(lead_id, False, str(exc)[:300])
        return {"id": lead_id, "url": url, "sent_ok": False, "error": "delivery failed"}
    db.mark_sent(lead_id, True)
    return {"id": lead_id, "url": url, "sent_ok": True}


@app.get("/p/{lead_id}", response_class=HTMLResponse)
def plan_page(lead_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,16}", lead_id):
        raise HTTPException(404)
    plan = db.get_plan(lead_id)
    if plan is None:
        raise HTTPException(404)
    return HTMLResponse(render.plan_html(plan))


if settings.DEV_STATIC:  # local end-to-end only; Caddy serves these files in production
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(settings.ROOT / "public"), html=True, follow_symlink=True), name="public")


@app.exception_handler(HTTPException)
async def http_exc(_req, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
