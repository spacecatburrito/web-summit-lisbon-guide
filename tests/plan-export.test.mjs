import test from "node:test";
import assert from "node:assert/strict";
import { planText } from "../public/plan-export.js";

const evt = { kind: "event", item: { id: "night", title: "Wine, crypto; and AI", host: "Host Co", venue: "Bar X", area: "Chiado", url: "https://luma.com/x", date: "2026-11-10", start: "22:00", end: "01:00" } };
const open = { kind: "event", item: { id: "open", title: "Rooftop", host: "H", venue: "", area: "Centro", url: "https://luma.com/y", date: "2026-11-11", start: "19:00", end: null } };
const ses = { kind: "session", item: { id: "abc", title: "AI agents", loc: "Stage 4", url: "https://websummit.com/sessions/lis26/abc/x/", date: "2026-11-10", start: "10:30", end: "11:15" } };

test("plan text groups by day with time, place and a link for each item", () => {
  const t = planText([ses, evt, open], "https://tss.wtf/ws/");
  assert.match(t, /^My Web Summit plan/);
  assert.match(t, /Tuesday 10 Nov\n10:30-11:15 AI agents\nStage 4\nhttps:\/\/attend\.websummit\.com\/dl\/lis26\/event\?id=abc/);
  assert.match(t, /22:00-01:00 Wine, crypto; and AI\nHost Co, Bar X, Chiado\nhttps:\/\/luma\.com\/x/);
  assert.match(t, /Wednesday 11 Nov\n19:00 Rooftop/);
  assert.match(t, /https:\/\/tss\.wtf\/ws\/\s*$/);
});

test("registration status shows in the text", () => {
  const t = planText([evt], "https://tss.wtf/ws/", { night: "going" });
  assert.match(t, /22:00-01:00 Wine, crypto; and AI \(going\)/);
});
