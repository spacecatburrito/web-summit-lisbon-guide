// Session finder over the official programme (data/sessions.json). Pure functions, shared by the page and the tests.
// The page sends the top candidates to /api/sessions, where Claude picks the final few; pickSessions is the fallback.

// What a visitor can pick on the page, each mapped to the programme's own formats.
export const KINDS = [
  { id: "talks", label: "Talks & panels", formats: ["Keynote", "Fireside", "Super fireside", "Panel", "Talk", "Q&A", "Podcast", "PITCH"] },
  { id: "meetups", label: "Meetups", formats: ["Meetup", "Networking Reception"] },
  { id: "masterclasses", label: "Masterclasses", formats: ["Masterclass"] },
  { id: "booths", label: "Startup booths", formats: ["Away from the stage", "Experience", "Miscellaneous"] },
  { id: "night", label: "Night Summit", formats: ["Night Summit"] },
];

const STOP = new Set(("the and for with from that this you your are was were have has had not but our out all any can "
  + "into about just like want looking look find meet need some who what when where which will would could should "
  + "only also more most very really there their them they his her its one two get got how why lisbon web summit "
  + "online offline week day days monday tuesday wednesday thursday friday mon tue wed thu fri badge ticket").split(" "));

// Words that mean the same thing for search; any one of them pulls in the rest.
const GROUPS = [
  ["investor", "investors", "vc", "vcs", "venture", "fundraising", "fundraise", "raise", "raising", "capital", "angel", "angels", "funding"],
  ["game", "games", "gaming", "gamer", "esports"],
  ["ai", "agent", "agents", "agentic", "llm", "genai", "artificial"],
  ["crypto", "web3", "blockchain", "defi", "stablecoin", "stablecoins", "token", "tokenization", "bitcoin"],
  ["fintech", "payment", "payments", "banking", "bank", "moneyconf", "finance"],
  ["health", "healthtech", "medtech", "biotech", "medical"],
  ["climate", "energy", "sustainability", "cleantech"],
  ["hire", "hiring", "talent", "recruiting", "career", "careers", "job", "jobs"],
  ["marketing", "brand", "growth", "creator", "creators"],
  ["developer", "developers", "engineering", "engineer", "engineers", "code", "coding"],
  ["founder", "founders", "startup", "startups"],
  ["women", "female"],
  ["security", "cybersecurity", "cyber"],
];
const DAYS = { "2026-11-09": /\b(mon|monday)\b/, "2026-11-10": /\b(tue|tues|tuesday)\b/, "2026-11-11": /\b(wed|wednesday)\b/, "2026-11-12": /\b(thu|thur|thurs|thursday)\b/ };
const WEIGHTS = [["title", 3], ["track", 2], ["desc", 1], ["speakers", 1]];

// Request text -> list of term groups; a session scores once per group it matches.
function terms(text) {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [];
  const seen = new Set(), out = [];
  for (const w0 of words) {
    const w = w0.replace(/[.-]+$/, "");
    if ((w.length < 3 && w !== "ai") || STOP.has(w)) continue;
    const group = GROUPS.find((g) => g.includes(w));
    const key = group ? group[0] : w;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(group || [w]);
  }
  return out;
}

const matcher = (group) => new RegExp(`\\b(${group.map((w) => w.replace(/[.+#]/g, "\\$&")).join("|")})`, "i");

// Returns sessions that match the request, best first, each with a `score`. Named days and chosen kinds narrow the search.
export function findSessions(sessions, text, limit = 40, kinds = []) {
  const t = text.toLowerCase();
  const days = Object.keys(DAYS).filter((d) => DAYS[d].test(t));
  const formats = KINDS.filter((k) => kinds.includes(k.id)).flatMap((k) => k.formats);
  const res = terms(text).map(matcher);
  if (!res.length) return [];
  return sessions
    .filter((x) => (!days.length || days.includes(x.date)) && (!formats.length || formats.includes(x.format)))
    .map((x) => {
      const fields = { title: x.title, track: x.track, desc: x.desc, speakers: (x.speakers || []).join(" ") };
      const score = res.reduce((sum, re) => sum + Math.max(0, ...WEIGHTS.map(([f, w]) => (re.test(fields[f] || "") ? w : 0))), 0);
      const groups = res.filter((re) => WEIGHTS.some(([f]) => re.test(fields[f] || ""))).length;
      return { ...x, score: score + groups * 2 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, limit);
}

// Fallback choice when the server cannot rank: best first, no more than three of one format.
export function pickSessions(candidates, n = 8) {
  const perFormat = {}, out = [];
  for (const x of candidates) {
    if ((perFormat[x.format] || 0) >= 3) continue;
    perFormat[x.format] = (perFormat[x.format] || 0) + 1;
    out.push(x);
    if (out.length === n) break;
  }
  return out;
}
