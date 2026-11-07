import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIssueDescription } from "../lib/ai-classifier.ts";

const cases: { text: string; category?: string }[] = [
  { text: "There is a crack in the wall." },
  { text: "Please replace the broken floor tile." },
  { text: "A network packet was dropped." },
  { text: "The room is available." },
  { text: "Broken floor tile near the AC." },
  { text: "Pipe is not leaking." },
  { text: "No water leak." },
  { text: "There is no gas leak." },
  { text: "Socket is sparking, but there is no water leak.", category: "Electrical" },
  { text: "No smoke or gas, but the AC is broken.", category: "HVAC" },
  { text: "No power in the room.", category: "Electrical" },
  { text: "No hot water from the shower.", category: "Plumbing" },
  { text: "The AC isn't cooling.", category: "HVAC" },
  { text: "The sinks are leaking.", category: "Plumbing" },
  { text: "The outlets sparked.", category: "Electrical" },
  { text: "AC leaking water.", category: "HVAC" },
  { text: "Leaking pipe and sparking socket." },
  { text: "Pipe and sink leaking; socket outlet light sparking." },
  { text: "Water dripping directly onto an electrical outlet.", category: "Safety" },
  { text: "AC leaking water onto a socket.", category: "Safety" },
  { text: "No water leak near the outlet, but the socket is broken.", category: "Electrical" },
  { text: "There is a snake near D1.", category: "Safety" },
  { text: "Not sure whether there is smoke from the outlet.", category: "Safety" },
  { text: "AC not cooling and smoke coming from the outlet.", category: "Safety" },
  { text: "No power and smoke coming from an outlet.", category: "Safety" },
  { text: "No smoke and gas is leaking.", category: "Safety" },
  { text: "No water leak, socket is sparking.", category: "Electrical" },
  { text: "Smoke is not present." },
  { text: "ไม่มีน้ำรั่ว แต่ปลั๊กไฟเสีย", category: "Electrical" },
  { text: "ไม่มีไฟไหม้ แต่แอร์ไม่เย็น", category: "HVAC" },
  { text: "ท่อไม่รั่ว" },
  { text: "แอร์ไม่เย็นเลยครับ", category: "HVAC" },
  { text: "น้ำรั่วลงบนปลั๊กไฟ", category: "Safety" },
  { text: "แอร์ไม่เย็นและมีควัน", category: "Safety" },
  { text: "ไม่มีน้ำรั่วและมีควัน", category: "Safety" },
];

for (const { text, category } of cases) test(`classification regression: ${text}`, async () => {
  const result = await classifyIssueDescription({ description: text });
  assert.equal(result.fallbackToManual, !category);
  assert.equal(result.category_name, category);
  assert.ok(result.execution_time_ms < 1500);
});

test("negation in a title does not erase an affirmative fault in the description", async () => {
  assert.equal((await classifyIssueDescription({ title: "No smoke", description: "The socket is sparking." })).category_name, "Electrical");
});

test("repeating a keyword does not inflate its evidence or break an ambiguous tie", async () => {
  const single = await classifyIssueDescription({ description: "Pipe leaking and socket sparking." });
  const repeated = await classifyIssueDescription({ description: "Pipe pipe pipe pipe leaking and socket sparking." });
  assert.equal(single.fallbackToManual, true);
  assert.equal(repeated.fallbackToManual, true);
  assert.equal(single.confidence, repeated.confidence);
});

for (const text of ["The AC is broken in the lab.", "Office sink leaking.", "Snake at D1.", "Light broken at S10.", "AC broken between S1 and E1.", "Not at S1 or E1."]) {
  test(`no invented building/room: ${text}`, async () => assert.equal((await classifyIssueDescription({ description: text })).detected_building, undefined));
}
for (const [text, building] of [
  ["The AC at E1 is broken.", "E1 School of Information Tech"],
  ["Sink leaking at S-1.", "S1 Science Laboratory Wing"],
  ["Snake at AD1.", "AD1 Administration Building"],
  ["Light broken in C1 / C2.", "C1 / C2 Lecture Complex"],
  ["Not S1 but E1. AC isn't cooling.", "E1 School of Information Tech"],
  ["ไฟดับที่อาคารE1", "E1 School of Information Tech"],
  ["No hot water in E1.", "E1 School of Information Tech"],
  ["No power at S1.", "S1 Science Laboratory Wing"],
]) test(`unique explicit building hint: ${text}`, async () => {
  const hint = (await classifyIssueDescription({ description: text })).detected_building;
  assert.equal(hint?.name, building);
  assert.equal(Object.keys(hint!).some((key) => /room|floor|location/i.test(key)), false);
});
