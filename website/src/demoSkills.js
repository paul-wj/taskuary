// Fictional Skill package for the static demo only. Never used by production API fallback.
const FILES = [
  {
    "path": "SKILL.md",
    "sha256": "d24629b7e71f8418a71a24cdcf53691e9595bdfec817d510ddbe5aebd8175a97",
    "size": 253,
    "binary": false,
    "executable": false,
    "text": "---\nname: taskuary-demo-report-check\ndescription: Compare synthetic report totals and explain differences\n---\n\nUse scripts/check.py with examples/input.json. Keep real customer data out of examples. See references/source.md for the demonstration scope.\n",
    "encoded": "LS0tCm5hbWU6IHRhc2t1YXJ5LWRlbW8tcmVwb3J0LWNoZWNrCmRlc2NyaXB0aW9uOiBDb21wYXJlIHN5bnRoZXRpYyByZXBvcnQgdG90YWxzIGFuZCBleHBsYWluIGRpZmZlcmVuY2VzCi0tLQoKVXNlIHNjcmlwdHMvY2hlY2sucHkgd2l0aCBleGFtcGxlcy9pbnB1dC5qc29uLiBLZWVwIHJlYWwgY3VzdG9tZXIgZGF0YSBvdXQgb2YgZXhhbXBsZXMuIFNlZSByZWZlcmVuY2VzL3NvdXJjZS5tZCBmb3IgdGhlIGRlbW9uc3RyYXRpb24gc2NvcGUuCg=="
  },
  {
    "path": "assets/template.bin",
    "sha256": "a10b4e7968c0f9d0f0219054b19e4b3e81e890134a96c06a79845c6c252e32ce",
    "size": 27,
    "binary": true,
    "executable": false,
    "text": null,
    "encoded": "AHN5bnRoZXRpYy1yZXBvcnQtdGVtcGxhdGX/"
  },
  {
    "path": "examples/input.json",
    "sha256": "3ded0c06f58829636f46ba66cb8ff76aed93adfc2bfab62bfc0e68911db0558a",
    "size": 50,
    "binary": false,
    "executable": false,
    "text": "{\"left\": 9, \"right\": 4, \"expected_difference\": 5}\n",
    "encoded": "eyJsZWZ0IjogOSwgInJpZ2h0IjogNCwgImV4cGVjdGVkX2RpZmZlcmVuY2UiOiA1fQo="
  },
  {
    "path": "references/source.md",
    "sha256": "915f19df99649d510ec9c5fe396a810e199ea8b87386bfac5d5424e01d91b365",
    "size": 156,
    "binary": false,
    "executable": false,
    "text": "# Demonstration sources\n\nAll inputs and procedures in this package are fictional examples. No live AI analysis or Agent generation ran in this static demo.\n",
    "encoded": "IyBEZW1vbnN0cmF0aW9uIHNvdXJjZXMKCkFsbCBpbnB1dHMgYW5kIHByb2NlZHVyZXMgaW4gdGhpcyBwYWNrYWdlIGFyZSBmaWN0aW9uYWwgZXhhbXBsZXMuIE5vIGxpdmUgQUkgYW5hbHlzaXMgb3IgQWdlbnQgZ2VuZXJhdGlvbiByYW4gaW4gdGhpcyBzdGF0aWMgZGVtby4K"
  },
  {
    "path": "scripts/check.py",
    "sha256": "c9b095a085c9b3378ebea736fc85f0bbcdf879fdbc7e97f8b3e7e7d87b04af7d",
    "size": 168,
    "binary": false,
    "executable": false,
    "text": "import json, sys\nwith open(sys.argv[1], encoding=\"utf-8\") as source:\n    values = json.load(source)\nprint(json.dumps({\"difference\": values[\"left\"] - values[\"right\"]}))\n",
    "encoded": "aW1wb3J0IGpzb24sIHN5cwp3aXRoIG9wZW4oc3lzLmFyZ3ZbMV0sIGVuY29kaW5nPSJ1dGYtOCIpIGFzIHNvdXJjZToKICAgIHZhbHVlcyA9IGpzb24ubG9hZChzb3VyY2UpCnByaW50KGpzb24uZHVtcHMoeyJkaWZmZXJlbmNlIjogdmFsdWVzWyJsZWZ0Il0gLSB2YWx1ZXNbInJpZ2h0Il19KSkK"
  }
];
const DIGEST = "180110e024f9102ed3feee696f2100a50994330b9119deb693c9f31ef9913ad3";
const SLUG = "taskuary-demo-report-check";
export function installDemoSkills(state) {
  const sources = (state["/api/tasks"]?.data || []).filter(t => t.Status === "done").slice(0, 2).map(t => ({ task_id: t.TaskId, ref: t.ref || `TQ-${t.TaskId}`, title: t.Title, reason: "Illustrative source link in fictional demo data; no live analysis ran." }));
  const published = { slug: SLUG, name: SLUG, description: "Compare synthetic report totals and explain differences", digest: DIGEST, generation_id: 880003, origin_task_ids: sources.map(s => s.task_id), bindings: [] };
  const generation = { id: 880003, slug: SLUG, title: "Demonstration complete Skill package", state: "published", task_id: null, draft_digest: DIGEST, published_digest: DIGEST, review_id: null, review_state: null };
  const pack = { digest: DIGEST, files: FILES, validation: [{ check: "demo_resource_integrity", state: "passed", required: true, detail: "These fixture hashes describe the included demonstration bytes, not a live Agent's work." }], missing_checks: [] };
  state["/api/skill-library"] = { demo: true, analysis: { state: "ready", error: null }, suggestions: [{ id: 880001, action: "update", slug: SLUG, title: "Add duplicate-record checks", description: "Improve the existing comparison method instead of creating a duplicate Skill", rationale: "Illustrative AI recommendation for the demo: check repeated identifiers before calculating differences.", varies: "input files and key columns", target_digest: DIGEST, state: "suggested", evidence: sources }], skills: [published], generations: [generation] };
  state[`/api/skill-library/skills/${SLUG}`] = { ...published, package: pack };
  state["/api/skill-library/generations/880003"] = { ...generation, package: { ...pack, files: FILES.map(f => ({ ...f, change: "added", before_text: null, after_text: f.text })) } };
}
export function demoSkillFile(url) {
  const parsed = new URL(url, "http://demo.invalid");
  const file = FILES.find(f => f.path === parsed.searchParams.get("path"));
  if (!file || parsed.searchParams.get("digest") !== DIGEST) throw new Error("This demonstration Skill resource or revision is unavailable.");
  return new Blob([Uint8Array.from(atob(file.encoded), c => c.charCodeAt(0))], { type: "application/octet-stream" });
}
