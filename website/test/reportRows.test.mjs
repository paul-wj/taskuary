import test from "node:test";
import assert from "node:assert/strict";
import { jsonRows } from "../src/reportRows.js";

test("a data report's JSON lines read as rows; anything else stays text", () => {
  assert.deepEqual(jsonRows('{"site": "Lakeview", "headcount": 112}\n{"site": "Riverside", "headcount": 98}\n'),
    [{ site: "Lakeview", headcount: 112 }, { site: "Riverside", headcount: 98 }]);
  assert.equal(jsonRows("Three things came in.\n{\"a\": 1}"), null);
  assert.equal(jsonRows('{"nested": {"a": 1}}'), null);
  assert.equal(jsonRows(""), null);
});

// a new report started on SQL Server whether or not there was one, and its warning was a sentence with no way to act
// (the UX walk, 2026-10-22): it starts on the first connected source, and the warning is a button to that card
test("a new report starts on the first connected source", async () => {
  const { firstConnected } = await import("../src/sourceShape.js");
  const ok = { LastSyncAt: "2026-10-22 09:00", LastError: null };
  assert.equal(firstConnected(["mssql", "s3_object", "rss"], [{ Type: "aws", ...ok }], { s3_object: "aws" }), "s3_object");
  assert.equal(firstConnected(["mssql", "rss"], [{ Type: "mssql", LastSyncAt: "x", LastError: "login failed" }]), null);
  assert.equal(firstConnected(["mssql"], [{ Type: "mssql" }]), null);   // never read: not connected
});

// A DATA REPORT READS AS ONE (the owner, 2026-10-28: "the report on the demo site looks horrible"): its measure and its name picked as the
// server picks its chart, a run of days drawn as a line and a ranking as bars, every number of a column at one count of decimals, and one
// line of what it found - the total where a total means something, and the row that stands out
test("a report's rows say their chart, their columns' decimals and one line of what they found", async () => {
  const { reportShape, reportSummary, places, fmtNum } = await import("../src/reportRows.js");
  const ap = [{ vendor: "Alvarez Supply", past_due: 18420.55 }, { vendor: "Northline Linen", past_due: 9310 }, { vendor: "Kesler Medical", past_due: 7715.4 }];
  const s = reportShape(ap);
  assert.deepEqual([s.lab, s.val, s.chart, s.dated], ["vendor", "past_due", "bars", false]);
  assert.equal(places(ap, "past_due"), 2);
  assert.deepEqual(ap.map((r) => fmtNum(r.past_due, 2)), ["18,420.55", "9,310.00", "7,715.40"]);
  const ranking = reportSummary(ap);
  for (const value of ["3", "35,445.95", "Alvarez Supply", "18,420.55", "52%"]) assert.ok(ranking.includes(value));
  const days = [38, 41, 35, 52, 71].map((t, i) => ({ day: `2026-08-${18 + i}`, tickets: t }));
  assert.equal(reportShape(days).chart, "line");
  const latestPeak = reportSummary(days);
  for (const value of ["5", "237", "71", "22"]) assert.ok(latestPeak.includes(value));
  const earlierPeak = reportSummary([...days, { day: "2026-08-23", tickets: 9 }]);
  for (const value of ["6", "246", "71", "9"]) assert.ok(earlierPeak.includes(value));
  // an average is not summed; a table with no number has no chart; numbers sent as strings still count
  const average = reportSummary([{ site: "Lakeview", avg_wait: 4 }, { site: "Riverside", avg_wait: 7 }]);
  assert.ok(average.includes("Riverside"));
  assert.ok(average.includes("7"));
  assert.ok(!average.includes("11"), "averages are not summed");
  assert.equal(reportShape([{ site: "Lakeview", lead: "Erin Blake" }, { site: "Riverside", lead: "Gail Moreno" }]).chart, null);
  assert.equal(reportShape([{ site: "Lakeview", headcount: "1,112" }, { site: "Riverside", headcount: "98" }]).val, "headcount");
});
