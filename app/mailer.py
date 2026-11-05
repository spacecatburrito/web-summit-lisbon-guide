"""SMTP delivery. Raises on any failure; the caller records the error."""
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from . import settings


def send_plan(to: str, plan_html: str, plan_text: str) -> None:
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")
    msg = EmailMessage()
    msg["Subject"] = "Your Web Summit 2026 side-event plan"
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL or settings.SMTP_USER))
    msg["To"] = to
    msg.set_content(plan_text)
    msg.add_alternative(plan_html, subtype="html")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)
