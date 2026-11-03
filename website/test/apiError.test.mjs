// The seam, which is where this broke: processingAll's predicates were tested on hand-built error
// objects, api.js's normalizer was never tested at all, and nothing ran the two together. In the
// app the normalizer runs FIRST on every rejection, so a structured refusal reached the deciding
// code as a JSON string that matched no code - the Assistant's two pile retries went
// unreachable, and a routine "membership is being
// reconciled" surfaced as axios's "Request failed with status code 409" in a red banner.
import test from "node:test";
import assert from "node:assert/strict";
import { detailText, keepDetail } from "../src/apiError.js";
import { isCoveragePending, processingErrorCode, processingErrorMessage } from "../src/processingAll.js";

// what axios hands a catch block after the interceptor has run, for a real 409 from the inventory
const refused = (code, message, extra = {}) => keepDetail({
  message: "Request failed with status code 409",
  response: { status: 409, data: { detail: { code, message, ...extra } } },
});

test("a refusal still names itself after normalizing, so its recovery can run", () => {
  const pending = refused("processing_coverage_pending", "All items are not ready yet", { coverage: {} });
  assert.equal(processingErrorCode(pending), "processing_coverage_pending");
  assert.equal(isCoveragePending(pending), true);
  assert.equal(processingErrorMessage(pending, "Failed to load the feed"), "All items are not ready yet");
  const moved = refused("processing_target_moved", "That item moved under you");
  assert.equal(processingErrorCode(moved), "processing_target_moved");
  assert.equal(moved.detail.message, "That item moved under you");   // the banner's words are the server's
});


test("the rendered copy is still a plain string, which every setErr site relies on", () => {
  const e = refused("processing_coverage_pending", "All items are not ready yet");
  assert.equal(typeof e.response.data.detail, "string");
  assert.match(e.response.data.detail, /processing_coverage_pending/);
});

test("a FastAPI validation array still reads as one line, never as [object Object]", () => {
  const e = keepDetail({ response: { data: { detail: [{ loc: ["body", "name"], msg: "field required" }] } } });
  assert.equal(e.response.data.detail, "body.name: field required");
  assert.equal(detailText([{ loc: ["a"], msg: "bad" }, { loc: ["b"], msg: "worse" }]), "a: bad · b: worse");
});

test("a string detail, and an error with no body at all, are left exactly as they are", () => {
  const said = keepDetail({ response: { data: { detail: "this reply has already been decided" } } });
  assert.equal(said.response.data.detail, "this reply has already been decided");
  assert.equal(said.detail, undefined);              // nothing to keep: it was never structured
  assert.equal(processingErrorMessage(said, "fallback"), "this reply has already been decided");
  assert.doesNotThrow(() => keepDetail(new Error("Network Error")));
  assert.equal(processingErrorMessage(new Error("Network Error"), "fallback"), "Network Error");
});

test("a structured refusal's shape - read off error.detail - is kept on the error", async () => {
  const e = keepDetail({ response: { status: 409, data: { detail: { code: "processing_coverage_pending", retryable: true } } } });
  assert.equal(e.detail?.code, "processing_coverage_pending");
});

test("error presentation translates only authored fallbacks and preserves server messages", async () => {
  const { errorPresentation, errorText } = await import("../src/apiError.js");
  const { getLocale, setLocale } = await import("../src/i18n.js");
  const server = errorPresentation(keepDetail({ response: { status: 422, data: { detail: "That didn't save. Try again in a moment." } } }));
  const structured = errorPresentation(refused("x", "That item moved under you"));
  const network = errorPresentation(new Error("Network Error"));
  const fallback = errorPresentation({ response: { status: 500, data: {} } });
  const rawFallback = errorPresentation({ response: { status: 500, data: {} } }, "Settings", { localFallback: false });
  const previous = getLocale();
  try {
    setLocale("en");
    const englishFallback = errorText(fallback), englishNetwork = errorText(network);
    assert.equal(errorText(server), "That didn't save. Try again in a moment.");
    assert.equal(errorText(structured), "That item moved under you");
    setLocale("zh-CN");
    assert.equal(errorText(server), "That didn't save. Try again in a moment.");
    assert.equal(errorText(structured), "That item moved under you");
    assert.equal(errorText(rawFallback), "Settings");
    assert.notEqual(errorText(fallback), englishFallback);
    assert.notEqual(errorText(network), englishNetwork);
  } finally {
    setLocale(previous);
  }
});

