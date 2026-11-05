import test from "node:test";
import assert from "node:assert/strict";
import { QUIZ } from "../public/quiz-data.js";
import { buildPlan, scoreEvent } from "../public/plan.js";

const ev = (o) => ({
  id: "x", title: "X", host: "H", date: "2026-11-10", start: "18:00", end: "20:00", venue: "", address: "", area: "",
  url: "https://e", price: "free", access: "register", needs_badge: false,
  tags: { audience: [], sectors: [], goals: [], communities: [], vibe: "networking" },
  note: "", verified_on: "2026-10-30", elena_pick: false, ...o,
});
const ans = (o) => ({ role: "founder", goal: "raise", sector: "fintech", badge: "yes", days: ["d09", "d10", "d11", "d12"], evenings: "party", groups: [], ...o });

test("quiz has seven questions with the agreed ids", () => {
  assert.deepEqual(QUIZ.map((q) => q.id), ["role", "goal", "sector", "badge", "days", "evenings", "groups"]);
  assert.equal(QUIZ.filter((q) => q.multi).length, 2);
});

test("badge filter excludes badge-only events for visitors without a badge", () => {
  const plan = buildPlan(ans({ badge: "no" }), [ev({ id: "a", needs_badge: true }), ev({ id: "b" })], []);
  assert.deepEqual(plan.days.flatMap((d) => d.events.map((e) => e.id)), ["b"]);
});

test("day filter keeps only selected days", () => {
  const plan = buildPlan(ans({ days: ["d11"] }), [ev({ id: "a", date: "2026-11-10" }), ev({ id: "b", date: "2026-11-11" })], []);
  assert.deepEqual(plan.days.map((d) => d.date), ["2026-11-11"]);
  assert.deepEqual(plan.days[0].events.map((e) => e.id), ["b"]);
});

test("closed events are excluded", () => {
  const plan = buildPlan(ans(), [ev({ id: "a", access: "closed" })], []);
  assert.equal(plan.days.length, 0);
});

test("scoring weights: goal 3, sector 2, audience 2, community 2, vibe 1, pick 1", () => {
  const a = ans({ groups: ["ru"], evenings: "party" });
  assert.equal(scoreEvent(a, ev({ tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "talk" } })), 3);
  assert.equal(scoreEvent(a, ev({ tags: { audience: [], sectors: ["fintech"], goals: [], communities: [], vibe: "talk" } })), 2);
  assert.equal(scoreEvent(a, ev({ tags: { audience: ["founder"], sectors: [], goals: [], communities: [], vibe: "talk" } })), 2);
  assert.equal(scoreEvent(a, ev({ tags: { audience: [], sectors: [], goals: [], communities: ["ru"], vibe: "talk" } })), 2);
  assert.equal(scoreEvent(a, ev({ tags: { audience: [], sectors: [], goals: [], communities: [], vibe: "party" } })), 1);
  assert.equal(scoreEvent(a, ev({ elena_pick: true, tags: { audience: [], sectors: [], goals: [], communities: [], vibe: "talk" } })), 1);
  assert.equal(scoreEvent(a, ev({ elena_pick: true, tags: { audience: ["founder"], sectors: ["fintech"], goals: ["raise"], communities: ["ru"], vibe: "party" } })), 11);
});

test("evenings=day excludes parties and dinners; drinks excludes parties only", () => {
  const evs = [ev({ id: "p", tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "party" } }),
               ev({ id: "d", start: "20:00", end: "22:00", tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "dinner" } }),
               ev({ id: "t", start: "10:00", end: "11:00", tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "talk" } })];
  const day = buildPlan(ans({ evenings: "day" }), evs, []).days.flatMap((d) => d.events.map((e) => e.id));
  assert.deepEqual(day, ["t"]);
  const drinks = buildPlan(ans({ evenings: "drinks" }), evs, []).days.flatMap((d) => d.events.map((e) => e.id)).sort();
  assert.deepEqual(drinks, ["d", "t"]);
});

test("overlapping picks on one day keep the higher score", () => {
  const hi = ev({ id: "hi", start: "18:00", end: "21:00", tags: { audience: ["founder"], sectors: ["fintech"], goals: ["raise"], communities: [], vibe: "networking" } });
  const lo = ev({ id: "lo", start: "19:00", end: "22:00", tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "networking" } });
  const plan = buildPlan(ans(), [lo, hi], []);
  assert.deepEqual(plan.days[0].events.map((e) => e.id), ["hi"]);
});

test("max two events per day and eight in total", () => {
  const evs = [];
  for (const d of ["09", "10", "11", "12", "13"]) for (let i = 0; i < 4; i++)
    evs.push(ev({ id: `${d}-${i}`, date: `2026-11-${d}`, start: `${10 + i * 3}:00`, end: `${12 + i * 3}:00`, tags: { audience: [], sectors: [], goals: ["raise"], communities: [], vibe: "talk" } }));
  const plan = buildPlan(ans({ days: ["d09", "d10", "d11", "d12", "d13"] }), evs, []);
  assert.ok(plan.days.every((d) => d.events.length <= 2));
  assert.equal(plan.days.reduce((n, d) => n + d.events.length, 0), 8);
});

test("no badge and only Thursday selected yields an empty day, not a crash", () => {
  const plan = buildPlan(ans({ badge: "no", days: ["d12"] }), [ev({ id: "a", date: "2026-11-12", needs_badge: true })], []);
  assert.deepEqual(plan.emptyDays, ["2026-11-12"]);
  assert.equal(plan.days.length, 0);
  assert.match(plan.summary, /no badge/i);
});

test("tips match answers, no-badge tip appears, logistics always, max five", () => {
  const tips = [
    { id: "nb", text: "", tags: ["no_badge"], source: "s" },
    { id: "lg", text: "", tags: ["logistics"], source: "s" },
    { id: "ev", text: "", tags: ["evenings"], source: "s" },
    { id: "bd", text: "", tags: ["badge"], source: "s" },
    { id: "x1", text: "", tags: ["networking"], source: "s" },
    { id: "x2", text: "", tags: ["networking"], source: "s" },
    { id: "x3", text: "", tags: ["food"], source: "s" },
  ];
  const plan = buildPlan(ans({ badge: "no", evenings: "day" }), [], tips);
  const ids = plan.tips.map((t) => t.id);
  assert.ok(ids.includes("nb"));
  assert.ok(ids.includes("lg"));
  assert.ok(!ids.includes("bd"));
  assert.ok(!ids.includes("ev"));
  assert.ok(plan.tips.length <= 5);
});

test("summary reads naturally when role is other", () => {
  const plan = buildPlan(ans({ role: "other", sector: "crypto" }), [], []);
  assert.match(plan.summary, /^Crypto or web3 attendee,/);
});
