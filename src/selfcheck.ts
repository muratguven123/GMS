/**
 * Lightweight offline checks for filters, percentiles, integrity, guards, fail-on, history.
 */
import assert from "node:assert/strict";
import { scopeRepoSlug } from "./config.js";
import { METRIC_CONTRACT_VERSION } from "./contract.js";
import { shouldFailOn } from "./fail.js";
import {
  isBotActor,
  isMeaningfulReview,
  isSameAuthor,
  normalizeActivity,
} from "./filters.js";
import { detectManipulationSignals } from "./guards.js";
import { appendHistoryEntry } from "./history.js";
import { buildIntegrityBlock } from "./integrity.js";
import { mean, percentile, summarizeHours } from "./metrics.js";
import type {
  AggregateMetrics,
  BitbucketActivityItem,
  MetricsSnapshot,
  NormalizedActivity,
  PrTimingSample,
  ReportMeta,
} from "./types.js";

assert.equal(mean([]), null);
assert.equal(mean([2, 4, 6]), 4);
assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
assert.equal(percentile([10], 90), 10);
assert.equal(scopeRepoSlug(["b", "a"]), "a,b");

const stats = summarizeHours([1, 2, 3, 4, 5]);
assert.equal(stats.n, 5);
assert.ok(stats.p50Hours != null);

assert.equal(isBotActor({ nickname: "jenkins-ci" }), true);
assert.equal(isBotActor({ username: "alice" }), false);
assert.equal(isSameAuthor({ uuid: "{a}" }, { uuid: "{a}" }), true);

const comment: BitbucketActivityItem = {
  comment: {
    created_on: "2024-01-01T12:00:00.000Z",
    user: { uuid: "{reviewer}", nickname: "bob" },
  },
};
const norm = normalizeActivity(comment) as NormalizedActivity;
assert.equal(norm.kind, "comment");
assert.equal(isMeaningfulReview(norm, { uuid: "{author}" }), true);
assert.equal(isMeaningfulReview(norm, { uuid: "{reviewer}" }), false);

const updateOnly: BitbucketActivityItem = {
  update: {
    date: "2024-01-01T12:00:00.000Z",
    author: { uuid: "{reviewer}", nickname: "bob" },
  },
};
const upd = normalizeActivity(updateOnly) as NormalizedActivity;
assert.equal(isMeaningfulReview(upd, { uuid: "{author}" }), false);

const created = new Date("2024-01-01T10:00:00.000Z");
const instantSamples: PrTimingSample[] = Array.from({ length: 12 }, () => ({
  createdOn: created,
  mergedOn: new Date("2024-01-02T10:00:00.000Z"),
  firstMeaningfulReviewAt: new Date("2024-01-01T10:01:00.000Z"),
  firstApprovalAt: new Date("2024-01-01T10:01:00.000Z"),
}));
const instantMetrics: AggregateMetrics = {
  ttfr: summarizeHours(instantSamples.map(() => 1 / 60)),
  reviewCycle: summarizeHours(instantSamples.map(() => 0)),
  leadTime: summarizeHours(instantSamples.map(() => 24)),
};
const manip = detectManipulationSignals(instantSamples, instantMetrics);
assert.ok(manip.some((f) => f.code === "HIGH_INSTANT_TTFR_RATE"));
assert.equal(shouldFailOn(manip, "none"), false);
assert.equal(shouldFailOn(manip, "high"), true);
assert.equal(shouldFailOn([{ code: "X", severity: "low", message: "m" }], "medium"), false);

const meta: ReportMeta = {
  workspace: "ws",
  repoSlug: "a,b",
  repos: ["a", "b"],
  sampleSize: 12,
  createdRangeStart: created.toISOString(),
  createdRangeEnd: created.toISOString(),
  generatedAt: "2024-01-03T00:00:00.000Z",
  contractVersion: METRIC_CONTRACT_VERSION,
};
const a = buildIntegrityBlock(instantMetrics, meta);
const b = buildIntegrityBlock(instantMetrics, meta);
assert.equal(a.sha256, b.sha256);

const snap: MetricsSnapshot = {
  contractVersion: METRIC_CONTRACT_VERSION,
  workspace: "ws",
  repoSlug: "a,b",
  sampleSize: 12,
  createdRangeStart: created.toISOString(),
  createdRangeEnd: created.toISOString(),
  generatedAt: "2024-01-03T00:00:00.000Z",
  integritySha256: a.sha256,
  metrics: instantMetrics,
};
const hist = appendHistoryEntry(null, snap, 2);
assert.equal(hist.entries.length, 1);
const hist2 = appendHistoryEntry(hist, { ...snap, generatedAt: "2024-01-04T00:00:00.000Z" }, 2);
assert.equal(hist2.entries.length, 2);
const hist3 = appendHistoryEntry(
  hist2,
  { ...snap, generatedAt: "2024-01-05T00:00:00.000Z" },
  2,
);
assert.equal(hist3.entries.length, 2);
assert.equal(hist3.entries[0].generatedAt, "2024-01-04T00:00:00.000Z");

console.log("selfcheck ok");
