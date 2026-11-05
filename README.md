# Web Summit Lisbon 2026 guide

An unofficial, mobile-first guide to Web Summit Lisbon (9 to 12 November 2026). It is live at **https://tss.wtf/ws/**.

It helps you:

- find side events around the summit by topic, day and price, or describe what you want in plain words;
- get session picks inside the venue (talks, meetups, masterclasses, Night Summit), chosen by Claude from the official programme;
- save events and sessions to **My plan**, see what is next with directions, spot overlaps, mark Applied or Going;
- send the plan to your calendar (.ics), notes, Telegram or WhatsApp;
- read hacks for the week: badge pickup, metro, food, how to meet people.

Made by [Elena Shiltseva](https://www.linkedin.com/in/elenashiltseva). Not affiliated with Web Summit or with the hosts of the side events listed.

Fork it for your own conference or city. Pull requests with fixes or new events are welcome.

## How it works

- `public/`: static page in plain HTML, CSS and ES modules, no build step. `filters.js`, `sessions.js` and `plan-export.js` are pure functions with tests.
- `app/`: a small FastAPI backend:
  - `/api/parse`: turns a free-text request into filters;
  - `/api/sessions`: Claude picks sessions from keyword candidates;
  - `/api/plan.ics`: builds the calendar file;
  - `/api/feedback`: thumbs up or down on the picks;
  - `/api/t`: anonymous usage counts.
- `data/events.json`: hand-checked side events (schema in `data/schema.md`).
- `data/sessions.json` is **not included**. Build it from a JSON dump of the official programme with `scripts/build_sessions.py`. Tests use the synthetic programme in `tests/fixtures/sessions.json`.

## Run locally

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[test]'
.venv/bin/python -m pytest          # Python tests
node --test tests/*.test.mjs        # JS tests (Node 22+)
WS26_DEV_STATIC=1 .venv/bin/python -m uvicorn app.main:app --port 8787
```

Open http://localhost:8787/. Without `ANTHROPIC_API_KEY`, the free-text parser and the session picks fall back to keyword matching.

Settings come from environment variables (see `app/settings.py`):

- `ANTHROPIC_API_KEY`, `WS26_PARSE_MODEL`;
- `WS26_DB_PATH`, `WS26_EVENTS_PATH`, `WS26_SESSIONS_PATH`;
- SMTP and Telegram bot settings for sending plans.

Keep secrets in an `.env` file outside the repo.

`deploy/` has the systemd unit, Caddy snippets and the install script used on a single Ubuntu server. Adapt the paths and users to yours.

## Privacy

The usage counts store no cookies, IP addresses, user agents or typed text. A visitor is counted with a hash of a random daily salt, the IP and the user agent. The salt lives only in memory and changes every day, so visits cannot be linked across days. The plan lives in the visitor's browser (`localStorage`). The server sees plan ids only when the visitor asks for a calendar file.

Owners can keep their own visits out of the numbers by opening the page once with `?notrack`.

`python -m app.cli report 7` prints a readable report: goals reached, most saved items, feedback and one line per visit.

## License

Code: MIT, see `LICENSE`.

Photos in `public/img` are from the Web Summit Flickr stream via Wikimedia Commons, under CC BY 2.0. Credits are on the page. `elena.jpg` is the author's portrait: replace it in your fork.
