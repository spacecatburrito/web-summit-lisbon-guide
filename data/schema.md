# Data files

`events.json`: list of events. Keys: id (slug), title, host, date (YYYY-MM-DD), start/end ("HH:MM" Lisbon time or null), venue, address, area, url (https), price ("free" | "free tier" | "EUR ..."), access (open | register | approval | invite | badge | closed), needs_badge (bool), tags {audience[], sectors[], goals[], communities[], vibe, themes[]}, note (one line), verified_on (date the live page was checked), elena_pick (bool).

Tag vocabularies must match `public/quiz-data.js`:
audience: founder, product, investor, sales, recruiter, corporate, other
goals: hire, get_hired, cofounder, raise, sell, learn, party
sectors: fintech, crypto, ai, saas, consumer, any
communities: ru, latam, women, crypto_biz, any
vibe: talk, networking, party, breakfast, dinner, workshop

`themes` are page-only topic filters (not used by the quiz or the parser): investors, product, regional, women, compliance, careers. Hand-assigned from the title and note; may be empty.

`access`: what the live page showed on `verified_on`. Waitlist is recorded as `approval` with a note; sold out is `closed`.

`tips.json`: list of {id, text (<= 240 chars), tags[], source (URL or "Elena")}.
Tip tags: first_timer, badge, no_badge, logistics, networking, evenings, food, app, weather, transport, lisbon, party.

Check before every redeploy: `python3 scripts/check_data.py`.
