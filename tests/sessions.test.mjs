import test from "node:test";
import assert from "node:assert/strict";
import { findSessions, pickSessions, KINDS } from "../public/sessions.js";

const s = (id, title, o = {}) => ({ id, title, desc: "", date: "2026-11-10", start: "10:00", end: "10:45", loc: "Stage 1", track: "", format: "Panel", speakers: [], ...o });
const ids = (list) => list.map((x) => x.id);

test("a title match ranks above a description-only match", () => {
  const all = [s("desc", "Building studios", { desc: "How game studios grow" }), s("title", "The future of gaming")];
  assert.deepEqual(ids(findSessions(all, "online game")), ["title", "desc"]);
});

test("investor words expand to VC, venture and fundraising", () => {
  const all = [s("vc", "Meet the VCs"), s("venture", "Venture debt explained", { track: "Venture Summit" }), s("other", "Cloud costs")];
  assert.deepEqual(ids(findSessions(all, "I am looking for investors")).sort(), ["vc", "venture"]);
});

test("sessions matching more of the request rank higher", () => {
  const all = [s("one", "Gaming art direction"), s("both", "Investors in gaming"), s("inv", "Investor relations 101")];
  assert.equal(findSessions(all, "investors for my online game")[0].id, "both");
});

test("named days limit the results to those days", () => {
  const all = [s("tue", "AI agents", { date: "2026-11-10" }), s("wed", "AI agents at scale", { date: "2026-11-11" })];
  assert.deepEqual(ids(findSessions(all, "AI, only Wednesday")), ["wed"]);
});

test("a request with nothing in common returns no sessions", () => {
  assert.deepEqual(findSessions([s("a", "Cloud costs")], "underwater basket weaving"), []);
});

test("short words like AI still match, as whole words only", () => {
  const all = [s("ai", "AI in banking"), s("said", "What the CEO said")];
  assert.deepEqual(ids(findSessions(all, "ai")), ["ai"]);
});

test("the fallback pick keeps at most three sessions of one format", () => {
  const all = ["a", "b", "c", "d"].map((x) => s(x, "Gaming " + x, { format: "Meetup" })).concat([s("m", "Gaming masterclass", { format: "Masterclass" })]);
  const picked = pickSessions(findSessions(all, "gaming"), 8);
  assert.equal(picked.filter((x) => x.format === "Meetup").length, 3);
  assert.ok(picked.some((x) => x.id === "m"));
});

test("chosen kinds of session narrow the search; none chosen means all", () => {
  const all = [s("meet", "AI founders meetup", { format: "Meetup" }), s("panel", "AI and regulation", { format: "Panel" }), s("mc", "AI agents in practice", { format: "Masterclass" })];
  assert.deepEqual(ids(findSessions(all, "AI", 40, ["meetups", "masterclasses"])).sort(), ["mc", "meet"]);
  assert.equal(findSessions(all, "AI", 40, []).length, 3);
});

test("every programme format belongs to exactly one kind", () => {
  const formats = ["Away from the stage", "Experience", "Fireside", "Keynote", "Masterclass", "Meetup", "Miscellaneous", "Networking Reception", "Night Summit", "PITCH", "Panel", "Podcast", "Q&A", "Super fireside", "Talk"];
  for (const f of formats) assert.equal(KINDS.filter((k) => k.formats.includes(f)).length, 1, f);
});
