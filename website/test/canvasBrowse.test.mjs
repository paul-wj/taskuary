import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const src = (f) => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf8");

// Browsing Connections, Settings, Reports and Hub in the canvas (the canvas redesign, 2026-09-29): sections -> list ->
// one, Back returns; every step client state, one detail mounted at a time, and the open card is the next turn's subject.
test("each of the four views draws through the canvas's frame when it is handed `browse`", () => {
  for (const [file, sig] of [["ConnectorsView.jsx", "export default function ConnectorsView({ onNavigate, browse = null, browseState = {}, onBrowseState = null })"],
    ["ReportsView.jsx", "export default function ReportsView({ browse = null, browseState = {}, onBrowseState = null })"],
    ["SettingsView.jsx", "export default function SettingsView({ onNavigate, browse = null, browseState = {}, onBrowseState = null, area = \"settings\" })"],
    ["HubView.jsx", "export default function HubView({ onOpenTask, browse = null, browseState = {}, onBrowseState = null })"]]) {
    const s = src(file);
    assert.ok(s.includes(sig), file);
    assert.match(s, /return browse\(\{/, `${file} returns its frame`);
  }
});

test("Back and a section chip change only the line's own state - no fetch", () => {
  const frame = src("CanvasBrowse.jsx");
  assert.match(frame, /data-tq-browse-back="" onClick=\{onBack\}/);
  for (const file of ["ConnectorsView.jsx", "ReportsView.jsx", "SettingsView.jsx", "HubView.jsx"]) {
    const s = src(file), at = s.indexOf("return browse({");
    const block = s.slice(at, s.indexOf("\n    });", at));
    assert.match(block, /onBack:/, file);
    assert.doesNotMatch(block.slice(block.indexOf("onSection:"), block.indexOf("onSection:") + 200), /api\.|loadPile/, file);
  }
});

test("the card open in the canvas rides the next turn as its subject", () => {
  const view = src("AssistantView.jsx");
  assert.match(view, /open_card: openCardRef\.current/);
  assert.match(src("CanvasBrowse.jsx"), /useEffect\(\(\) => \{ if \(live\) onOpenCard\?\.\(detail \? openLabel : where\); \}/);
});

// the owner, 2026-09-29: "I don't see the rest of the docs ... we need sub settings to see all the files soul.md/counsel"
// - on the tab the rail listed every document; in the canvas Docs was one card showing only the first
test("Docs in the canvas lists every document the tab's rail did, and opens the one picked", () => {
  const s = src("SettingsView.jsx");
  const b = s.slice(s.indexOf("if (browse) {"), s.indexOf("return browse({", s.indexOf("if (browse) {")));
  assert.match(b, /docsTree\(docCat\)/, "the same tree the rail drew: documents, profiles, playbooks, How it works");
  assert.match(s, /setDocSel\(e\.sel\.action \? \{ \.\.\.e\.sel, n: Date\.now\(\) \} : e\.sel\)/);
  assert.match(s, /<DocsView (?:key=\{catN\} )?onCatalog=\{onCatalog\} catalogOnly \/>/, "the profiles and playbooks are listed before any document is opened");
});

// the sidebar and "Run a report or workflow" hand no state: the page opened on three chips and no list (the UX walk, 2026-10-22)
test("Reports opened with no shelf named shows the reports", () => {
  const s = src("ReportsView.jsx");
  assert.match(s, /: browseState\.section \?\? "reports";/);
  assert.doesNotMatch(s, /browseState\.section \?\? null/);
});

// A PAGE PUT DOWN IS A ROW OF THE WALK (the owner's screenshot, 2026-11-09): a folded Settings ran edge to edge as a bare bar, wider than every
// folded task around it and with no icon. It is drawn in the same .tq-msg column, mark gutter and .tq-fold card as a folded task, with its page's mark.
test("a folded browse card wears the folded task row's classes and its page's mark", () => {
  const view = src("AssistantView.jsx"), frame = src("CanvasBrowse.jsx");
  assert.match(view, /if \(m\.role === "browse" && canvas\?\.browsing !== m\.id\) return \(\n\s*<div className="tq-msg tq-browse-fold" data-tq-browse-line=\{m\.area\}><div className="avatar"><AssistantMark \/><\/div><div className="body">/);
  assert.match(view, /<div className="tq-fold" data-tq-folded=\{m\.card\.key\}/);   // the same card a folded task draws
  assert.match(frame, /return <div className="tq-fold" data-tq-browse-fold=\{area \|\| ""\}><Mark aria-hidden/);
  for (const a of ["new", "connections", "reports", "settings", "about", "hub"]) assert.match(frame, new RegExp(`${a}: \\w+Icon`), a);
  // ...and only a LIVE browse card spans the canvas's width
  assert.match(view, /<div className="tq-browse-line tq-canvas-live" data-tq-browse-line=\{m\.area\}>/);
});
