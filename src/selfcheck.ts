/**
 * Lightweight offline checks for filters, percentiles, integrity, guards.
 */
import assert from "node:assert/strict";
import { METRIC_CONTRACT_VERSION } from "./contract.js";
import {
  isBotActor,
  isMeaningfulReview,
  isSameAuthor,
  normalizeActivity,
} from "./filters.js";
import { detectManipulationSignals } from "./guards.js";
import { buildIntegrityBlock } from "./integrity.js";
import { mean, percentile, summarizeHours } from "./metrics.js";
import type {
  AggregateMetrics,
  BitbucketActivityItem,
  NormalizedActivity,
  PrTimingSample,
  ReportMeta,
} from "./types.js";

assert.equal(mean([]), null);
assert.equal(mean([2, 4, 6]), 4);
assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
assert.equal(percentile([10], 90), 10);

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

const meta: ReportMeta = {
  workspace: "ws",
  repoSlug: "repo",
  sampleSize: 12,
  createdRangeStart: created.toISOString(),
  createdRangeEnd: created.toISOString(),
  generatedAt: "2024-01-03T00:00:00.000Z",
  contractVersion: METRIC_CONTRACT_VERSION,
};
const a = buildIntegrityBlock(instantMetrics, meta);
const b = buildIntegrityBlock(instantMetrics, meta);
assert.equal(a.sha256, b.sha256);
assert.equal(a.contractVersion, METRIC_CONTRACT_VERSION);

console.log("selfcheck ok");
