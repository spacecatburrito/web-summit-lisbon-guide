"""Telegram delivery bot. /start <plan id> sends the plan; anything else gets a one-line help. Long polling, no public port."""
import html
import logging

from . import db, render, settings

log = logging.getLogger("ws26.bot")
HELP = f"I send Web Summit 2026 plans built at {settings.PUBLIC_BASE_URL}. Finish the quiz there and tap 'Send to my Telegram'."


def handle_start(token: str, chat_id: int, username: str | None) -> str:
    """Pure: returns the message text to send (HTML parse mode). Attaches the chat to the lead on success."""
    token = (token or "").strip()
    if not token:
        return HELP
    plan = db.get_plan(token)
    if plan is None:
        return HELP
    if plan.get("tg_chat_id") not in (None, chat_id):
        return HELP
    db.attach_tg(token, chat_id, username)
    return _as_html(render.plan_text(plan))


def _as_html(text: str) -> str:
    out = []
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("http"):
            out.append(f'<a href="{html.escape(stripped)}">{html.escape(stripped)}</a>')
        else:
            out.append(html.escape(line))
    return "\n".join(out)


async def run_bot(token: str) -> None:
    from aiogram import Bot, Dispatcher, F
    from aiogram.enums import ParseMode
    from aiogram.client.default import DefaultBotProperties
    from aiogram.filters import CommandStart, CommandObject
    from aiogram.types import Message

    bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML, link_preview_is_disabled=True))
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def on_start(message: Message, command: CommandObject):
        text = handle_start(command.args or "", message.chat.id, message.from_user.username if message.from_user else None)
        await message.answer(text)

    @dp.message(F.text)
    async def on_text(message: Message):
        await message.answer(HELP)

    log.info("telegram bot polling as @%s", settings.TELEGRAM_BOT_USERNAME or "?")
    await dp.start_polling(bot, handle_signals=False)
