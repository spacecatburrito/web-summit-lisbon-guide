"""Bundle public/ + data into one self-contained HTML file for a clickable Claude Artifact preview.

Usage: python3 scripts/build_preview.py <out.html>

The artifact has no backend, so the "Describe what you want" box uses a keyword parser ported from
app/parse.py instead of /api/parse, and a preview bar lets the viewer pick the date to see the archive work.
"""
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"


def strip_module(js: str) -> str:
    js = re.sub(r"^import .*?;\n", "", js, flags=re.M)
    return re.sub(r"^export ", "", js, flags=re.M)


KEYWORD_PARSE = r"""
// Preview-only port of app/parse.py keyword_parse (the live site asks Claude instead).
const KW = [
  ["role", "investor", /\b(investor|vc|angel|fund|lp)\b/], ["role", "recruiter", /\b(recruit\w*|talent|hr|headhunt\w*)\b/],
  ["role", "sales", /\b(sales|bd|business development|marketing|growth)\b/], ["role", "product", /\b(product|pm|cpo|designer|engineer|developer|cto)\b(?! (?:for|to hire))/],
  ["role", "corporate", /\b(bank|corporate|enterprise)\b/], ["role", "founder", /\b(founder|ceo|co-?founder of|my startup|our startup)\b/],
  ["goal", "hire", /\b(hire|hiring|looking for (?:a|an) (?:cpo|cto|pm|product|engineer|designer|head)|recruit)\b/],
  ["goal", "get_hired", /\b(job|new role|job hunting|looking for work|career|get hired|open to work)\b/], ["goal", "cofounder", /\bco-?founder\b/],
  ["goal", "raise", /\b(raise|raising|fundrais\w*|investors?|seed|series [ab])\b/], ["goal", "sell", /\b(customers?|clients?|partners?|leads?|sell|sales)\b/],
  ["goal", "party", /\b(party|parties|fun|cool people|meet people|drinks)\b/], ["goal", "learn", /\b(learn|talks?|workshops?)\b/],
  ["sector", "fintech", /\b(fintech|payments?|banking|neobank)\b/], ["sector", "crypto", /\b(crypto|web3|blockchain|defi|stablecoins?)\b/],
  ["sector", "ai", /\b(ai|llm|ml|agents?)\b/], ["sector", "saas", /\b(saas|b2b)\b/], ["sector", "consumer", /\b(consumer|b2c|app)\b/],
];
const DAY_WORDS = { d08: /\b(sun|sunday|8th|nov 8)\b/, d09: /\b(mon|monday|9th|nov 9)\b/, d10: /\b(tue|tues|tuesday|10th|nov 10)\b/,
  d11: /\b(wed|wednesday|11th|nov 11)\b/, d12: /\b(thu|thur|thurs|thursday|12th|nov 12)\b/, d13: /\b(fri|friday|13th|nov 13)\b/ };
const DAY_ORDER = Object.keys(DAY_WORDS);
const DAY_PREFIX = { sun: "d08", mon: "d09", tue: "d10", wed: "d11", thu: "d12", fri: "d13" };
const DAY_TOKEN = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?)";
function parseDays(t) {
  if (/\b(all week|whole week|every day|all days)\b/.test(t)) return [...DAY_ORDER];
  const days = new Set(DAY_ORDER.filter((d) => DAY_WORDS[d].test(t)));
  for (const m of t.matchAll(new RegExp(DAY_TOKEN + "\\s*(?:to|-|until|till|through|thru)\\s*" + DAY_TOKEN, "g"))) {
    const i = DAY_ORDER.indexOf(DAY_PREFIX[m[1].slice(0, 3)]), j = DAY_ORDER.indexOf(DAY_PREFIX[m[2].slice(0, 3)]);
    if (i <= j) DAY_ORDER.slice(i, j + 1).forEach((d) => days.add(d));
  }
  return [...days].sort();
}
function keywordParse(text) {
  const t = text.toLowerCase(), a = {};
  for (const [key, value, re] of [...KW].sort((x, y) => (x[0] !== "goal") - (y[0] !== "goal"))) {
    if (!(key in a) && re.test(t)) { if (key === "role" && value === "product" && a.goal === "hire") continue; a[key] = value; }
  }
  a.badge = /\b(no badge|without (?:a )?badge|no ticket|don'?t have (?:a )?(?:badge|ticket))\b/.test(t) ? "no" : /\b(badge|ticket)\b/.test(t) ? "yes" : "no";
  a.days = parseDays(t); if (!a.days.length) a.days = ["d09", "d10", "d11", "d12"];
  a.evenings = /\b(no (?:parties|evenings|nights)|daytime only|mornings?)\b/.test(t) ? "day" : /\b(party|parties|nightlife|late)\b/.test(t) ? "party" : "drinks";
  a.groups = [];
  if (/\b(russian|ukrain\w*|cee|cis|belarus\w*)\b/.test(t)) a.groups.push("ru");
  if (/\b(latam|brazil\w*|latin)\b/.test(t)) a.groups.push("latam");
  if (/\b(women|female|she)\b/.test(t)) a.groups.push("women");
  if (/\b(cross-?border|receive crypto|crypto payments|on-?ramp|off-?ramp)\b/.test(t)) a.groups.push("crypto_biz");
  a.role = a.role || "other"; a.goal = a.goal || "learn"; a.sector = a.sector || "any";
  const bits = [a.sector !== "any" ? label("sector", a.sector) : "any topic", a.days.length > 2 ? `${label("days", a.days[0])} to ${label("days", a.days.at(-1))}` : a.days.map((d) => label("days", d)).join(" and "), a.badge === "no" ? "no badge" : "with a badge"];
  return { answers: a, understood: bits.join(", ") };
}
"""

PREVIEW_BAR = """<div class="preview-bar" role="region" aria-label="Preview controls">
  <p><strong>Preview of the new tss.wtf/ws26.</strong> Not live yet. The describe box matches keywords here; the live site reads it with Claude.</p>
  <label for="preview-date">Pretend it is</label>
  <select id="preview-date">
    <option value="">today</option>
    <option value="2026-11-08T12:00">Sun 8 Nov, 12:00</option>
    <option value="2026-11-09T20:00">Mon 9 Nov, 20:00</option>
    <option value="2026-11-10T20:00">Tue 10 Nov, 20:00</option>
    <option value="2026-11-11T22:00">Wed 11 Nov, 22:00</option>
    <option value="2026-11-12T23:00">Thu 12 Nov, 23:00</option>
  </select>
</div>
"""

EXTRA_CSS = """
/* Artifact frame: side gutters clear phone system bars, sticky tabs clear the top inset. */
body { padding: 0; padding-block: 0 calc(57px + env(safe-area-inset-bottom, 0px)); padding-left: max(var(--gutter), env(safe-area-inset-left, 0px)); padding-right: max(var(--gutter), env(safe-area-inset-right, 0px)); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
@media (min-width: 700px) { body { padding-bottom: 48px; } .tabs { top: env(safe-area-inset-top, 0px); } }
.preview-bar { max-width: var(--maxw); margin: 12px auto 0; padding: 10px 12px; border: 1px dashed var(--accent); border-radius: var(--r); background: var(--tint); color: var(--muted); font-size: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.preview-bar p { margin: 0; flex-basis: 100%; }
.preview-bar strong { color: var(--ink); }
.preview-bar select { font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--hair); border-radius: 8px; min-height: 36px; padding: 0 8px; }
"""


def main(out: str) -> None:
    html = (PUB / "index.html").read_text()
    css = (PUB / "styles.css").read_text() + EXTRA_CSS
    events = json.loads((ROOT / "data" / "events.json").read_text())
    quiz = strip_module((PUB / "quiz-data.js").read_text())
    plan = strip_module((PUB / "plan.js").read_text())
    filters = strip_module((PUB / "filters.js").read_text())
    filters = re.sub(r"^const DAY_DATES = .*?;\n", "", filters, flags=re.M)  # same table already comes from quiz-data.js
    sessions_js = strip_module((PUB / "sessions.js").read_text())
    export_js = strip_module((PUB / "plan-export.js").read_text())
    sessions_data = json.loads((ROOT / "data" / "sessions.json").read_text())
    app = strip_module((PUB / "app.js").read_text())

    # Data inline instead of fetch; keyword parser instead of /api/parse; preview date instead of ?now=.
    app = app.replace('events = await fetch("data/events.json").then((r) => r.json());', "events = EVENTS;")
    # No backend in the artifact: sessions inline, keyword order instead of Claude's pick, feedback goes nowhere.
    app = app.replace('sessionsData ||= await fetch("data/sessions.json").then((r) => r.json());', "sessionsData ||= SESSIONS;")
    app = re.sub(r"async function rankRemote\(text, ids\) \{.*?\n\}\n", "async function rankRemote() { return null; }\n", app, count=1, flags=re.S)
    app = re.sub(r"function sendFeedback\(payload\) \{.*?\n\}\n", "function sendFeedback() {}\n", app, count=1, flags=re.S)
    app = re.sub(r'const res = await fetch\("api/parse".*?\n(.*?\n){3}', "const data = keywordParse(text);\n", app, count=1, flags=re.S)
    app = app.replace("const now = lisbonNow();", "let now = lisbonNow();")
    app = app.replace('const o = new URLSearchParams(location.search).get("now");', "const o = PREVIEW_NOW;")
    app = app.replace("function renderFilters() {", "function renderFilters() {\n  if (renderFilters.done) return renderDayChips();\n  renderFilters.done = true;")
    app = app.replace(
        '  const dates = [...new Set(splitArchive(events, now).active.map((e) => e.date))].sort();',
        '  renderDayChips();\n  $("#f-free").addEventListener("change", drawList);\n  $("#f-nobadge").addEventListener("change", drawList);\n}\n\nfunction renderDayChips() {\n  const dates = [...new Set(splitArchive(events, now).active.map((e) => e.date))].sort();')
    app = app.replace('  $("#f-free").addEventListener("change", drawList);\n  $("#f-nobadge").addEventListener("change", drawList);\n}\n\nfunction syncTopicChips',
                      "}\n\nfunction syncTopicChips")
    assert "keywordParse(text)" in app and "renderDayChips()" in app, "preview patch did not apply"
    assert "SESSIONS;" in app and "return null; }" in app and "function sendFeedback() {}" in app, "sessions patch did not apply"
    app += """
document.getElementById("preview-date").addEventListener("change", (ev) => {
  PREVIEW_NOW = ev.target.value || null;
  now = lisbonNow();
  renderFilters(); drawList(); renderMeetups();
});
"""
    script = "\n".join([
        "let PREVIEW_NOW = null;",
        "const EVENTS = " + json.dumps(events, ensure_ascii=False) + ";",
        "const SESSIONS = " + json.dumps(sessions_data, ensure_ascii=False, separators=(",", ":")) + ";",
        "function track() {}\nfunction startTracking() {}",  # no stats from the preview artifact
        quiz, plan, filters, sessions_js, export_js, KEYWORD_PARSE, app,
    ])
    head_title = "<meta charset=\"utf-8\">\n<title>WS26 Guide Preview</title>\n<meta name=\"claude:viewport-fit-sides\" content=\"cover\">\n"
    fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', html).group(0)
    body = html[html.index("<body>") + len("<body>"): html.index('<script type="module"')]
    body = body.replace('<header class="top">', PREVIEW_BAR + '<header class="top">', 1)
    # Photos inline: one 1800px JPEG each, no srcset (the artifact is a single file).
    body = re.sub(r' srcset="[^"]*" sizes="[^"]*"', "", body)
    body = re.sub(r'src="(img/[^"]+\.jpg)"', lambda m: 'src="data:image/jpeg;base64,' + base64.b64encode((PUB / m.group(1)).read_bytes()).decode() + '"', body)
    assert 'src="img/' not in body, "photo not inlined"
    page = head_title + fonts + "\n<style>\n" + css + "\n</style>\n" + body + "<script>\n" + script + "\n</script>\n"
    Path(out).write_text(page)
    print(out, len(page), "bytes")


if __name__ == "__main__":
    main(sys.argv[1])
