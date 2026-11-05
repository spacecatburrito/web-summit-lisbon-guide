import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TOPICS, TOPICS, filterEvents, fitTopicRow, planEntries, nextUp, overlaps, planPending } from "../public/filters.js";

const ev = (id, sectors, o = {}) => ({ id, date: "2026-11-10", start: "18:00", price: "free", needs_badge: false, access: "register", tags: { sectors }, ...o });
const all = [
  ev("fin", ["fintech", "any"]),
  ev("web3", ["crypto"]),
  ev("ai", ["ai"]),
  ev("saas", ["saas"]),
  ev("general", ["any"]),
  ev("paid-ai", ["ai"], { price: "EUR 50", date: "2026-11-11" }),
  ev("badge-ai", ["ai"], { needs_badge: true, date: "2026-11-11" }),
];
const ids = (r) => r.shown.map((e) => e.id);

test("default topics are web3, fintech and AI", () => {
  assert.deepEqual(DEFAULT_TOPICS, ["crypto", "fintech", "ai"]);
  assert.ok(TOPICS.some((t) => t.id === "any"));
});

test("topics cover sectors and themes, general networking last", () => {
  assert.deepEqual(TOPICS.map((t) => t.id), ["crypto", "fintech", "ai", "saas", "consumer", "investors", "product", "regional", "women", "compliance", "careers", "any"]);
  assert.deepEqual(TOPICS.slice(0, 4).map((t) => t.label), ["Web3", "Fintech", "AI", "SaaS & B2B"]);
});

test("a theme topic matches events tagged with that theme", () => {
  const evs = [ev("pitch", ["any"], { tags: { sectors: ["any"], themes: ["investors"] } }), ev("plain", ["any"])];
  assert.deepEqual(ids(filterEvents(evs, { topics: ["investors"] })), ["pitch"]);
});

const W = (id, width, selected = false) => ({ id, width, selected });
const row = { rowWidth: 300, gap: 10, otherWidth: 60 };

test("topic row: unselected topics fill one line in order, Other takes the rest", () => {
  const r = fitTopicRow([W("a", 70), W("b", 70), W("c", 70), W("d", 70)], row);
  assert.deepEqual(r, { row: ["a", "b", "c"], more: ["d"] });
});

test("topic row: a selected topic moves to the front even when it comes late", () => {
  const r = fitTopicRow([W("a", 70), W("b", 70), W("c", 70), W("d", 70, true)], row);
  assert.deepEqual(r, { row: ["d", "a", "b"], more: ["c"] });
});

test("topic row: selected topics that need two lines all stay; unselected only fill those lines", () => {
  const r = fitTopicRow([W("a", 100, true), W("b", 100, true), W("c", 100, true), W("d", 50), W("e", 200)], row);
  assert.deepEqual(r, { row: ["a", "b", "c", "d"], more: ["e"] });
});

test("topic row: everything fits, nothing left for Other", () => {
  const r = fitTopicRow([W("a", 40), W("b", 40)], row);
  assert.deepEqual(r, { row: ["a", "b"], more: [] });
});

test("default topics hide events outside web3, fintech and AI and count them", () => {
  const r = filterEvents(all, { topics: DEFAULT_TOPICS });
  assert.deepEqual(ids(r), ["fin", "web3", "ai", "paid-ai", "badge-ai"]);
  assert.equal(r.hiddenByTopic, 2);
});

test("no topic selected shows every event", () => {
  const r = filterEvents(all, { topics: [] });
  assert.equal(r.shown.length, all.length);
  assert.equal(r.hiddenByTopic, 0);
});

test("general topic shows events tagged any", () => {
  assert.deepEqual(ids(filterEvents(all, { topics: ["any"] })), ["fin", "general"]);
});

test("day, free and no-badge filters combine with topics", () => {
  const r = filterEvents(all, { topics: ["ai"], days: ["2026-11-11"], freeOnly: true, noBadge: true });
  assert.deepEqual(ids(r), []);
  assert.deepEqual(ids(filterEvents(all, { topics: ["ai"], days: ["2026-11-11"] })), ["paid-ai", "badge-ai"]);
  assert.deepEqual(ids(filterEvents(all, { topics: ["ai"], noBadge: true })), ["ai", "paid-ai"]);
});

test("hidden count ignores events already removed by other filters", () => {
  const r = filterEvents(all, { topics: ["crypto"], days: ["2026-11-11"] });
  assert.equal(r.hiddenByTopic, 2);
});

import { splitArchive, answersToFilters } from "../public/filters.js";

const at = (date, time) => ({ date, time });
const evt = (id, o) => ev(id, ["ai"], o);

test("saved-only shows bookmarked events across every topic and day", () => {
  const r = filterEvents(all, { topics: DEFAULT_TOPICS, days: ["2026-11-10"], saved: ["saas", "badge-ai"] });
  assert.deepEqual(ids(r), ["saas", "badge-ai"]);
  assert.equal(r.hiddenByTopic, 0);
});

test("closed events and past days go to the archive", () => {
  const list = [
    evt("past-day", { date: "2026-11-09", start: "18:00", end: "20:00" }),
    evt("closed", { date: "2026-11-12", access: "closed" }),
    evt("later-today", { date: "2026-11-10", start: "19:00", end: "21:00" }),
    evt("future", { date: "2026-11-11", start: "10:00", end: "12:00" }),
  ];
  const r = splitArchive(list, at("2026-11-10", "12:00"));
  assert.deepEqual(r.active.map((e) => e.id), ["later-today", "future"]);
  assert.deepEqual(r.archived.map((e) => e.id), ["past-day", "closed"]);
});

test("an event that ended earlier today is archived; one running past midnight is not", () => {
  const list = [
    evt("ended", { date: "2026-11-10", start: "09:00", end: "11:00" }),
    evt("running", { date: "2026-11-10", start: "19:00", end: "00:00" }),
    evt("no-end", { date: "2026-11-10", start: "21:00", end: null }),
    evt("no-end-old", { date: "2026-11-10", start: "08:00", end: null }),
  ];
  const r = splitArchive(list, at("2026-11-10", "23:30"));
  assert.deepEqual(r.active.map((e) => e.id), ["running", "no-end"]);
  assert.deepEqual(r.archived.map((e) => e.id), ["ended", "no-end-old"]);
});

test("before the week starts nothing but closed events is archived", () => {
  const r = splitArchive(all, at("2026-11-04", "13:00"));
  assert.equal(r.archived.length, 0);
});

test("a parsed request maps onto list filters", () => {
  assert.deepEqual(answersToFilters({ sector: "fintech", days: ["d10", "d11"], badge: "no" }),
    { topics: ["fintech"], days: ["2026-11-10", "2026-11-11"], noBadge: true });
  assert.deepEqual(answersToFilters({ sector: "any", days: [], badge: "yes" }),
    { topics: [], days: [], noBadge: false });
});

test("the plan mixes saved side events and sessions in time order and skips unknown ids", () => {
  const events = [ev("late", ["ai"], { date: "2026-11-10", start: "20:00" }), ev("early", ["ai"], { date: "2026-11-10", start: "09:00" })];
  const sessions = [{ id: "abc", title: "Panel", date: "2026-11-10", start: "12:00" }];
  const r = planEntries(["late", "s:abc", "early", "gone", "s:nope"], events, sessions);
  assert.deepEqual(r.map((x) => [x.kind, x.item.id]), [["event", "early"], ["session", "abc"], ["event", "late"]]);
});

test("next up is the first plan item that has not ended yet", () => {
  const e = (id, date, start, end = null) => ({ kind: "event", item: { id, date, start, end } });
  const entries = [e("done", "2026-11-10", "09:00", "10:00"), e("now", "2026-11-10", "18:00", "21:00"), e("later", "2026-11-11", "09:00")];
  assert.equal(nextUp(entries, { date: "2026-11-10", time: "19:00" }).item.id, "now");
  assert.equal(nextUp(entries, { date: "2026-11-04", time: "12:00" }).item.id, "done");
  assert.equal(nextUp(entries, { date: "2026-11-14", time: "12:00" }), null);
});

test("overlapping plan items point at each other; items without an end last three hours", () => {
  const e = (id, start, end = null, date = "2026-11-10") => ({ kind: "event", item: { id, title: id.toUpperCase(), date, start, end } });
  const o = overlaps([e("a", "18:00", "20:00"), e("b", "19:30", "22:00"), e("c", "22:00"), e("d", "19:00", null, "2026-11-11")]);
  assert.deepEqual(o, { a: ["B"], b: ["A"] });
});

test("the plan nudges until every saved item has been exported once", () => {
  assert.equal(planPending([], []), false);
  assert.equal(planPending(["a", "s:b"], []), true);
  assert.equal(planPending(["a", "s:b"], ["a", "s:b"]), false);
  assert.equal(planPending(["a", "c"], ["a", "s:b"]), true);
  assert.equal(planPending(["a"], ["a", "s:b"]), false);
});
