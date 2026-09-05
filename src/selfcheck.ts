/**
 * Lightweight offline checks for filters + percentiles (no Bitbucket API).
 */
import assert from "node:assert/strict";
import {
  isBotActor,
  isMeaningfulReview,
  isSameAuthor,
  normalizeActivity,
} from "./filters.js";
import { mean, percentile, summarizeHours } from "./metrics.js";
import type { BitbucketActivityItem, NormalizedActivity } from "./types.js";

assert.equal(mean([]), null);
assert.equal(mean([2, 4, 6]), 4);
assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
assert.equal(percentile([10], 90), 10);

const stats = summarizeHours([1, 2, 3, 4, 5]);
assert.equal(stats.n, 5);
assert.ok(stats.p50Hours != null);

assert.equal(isBotActor({ nickname: "jenkins-ci" }), true);
assert.equal(isBotActor({ username: "alice" }), false);
assert.equal(
  isSameAuthor({ uuid: "{a}" }, { uuid: "{a}" }),
  true,
);

const comment: BitbucketActivityItem = {
  comment: {
    created_on: "2024-01-01T12:00:00.000Z",
    user: { uuid: "{reviewer}", nickname: "bob" },
  },
};
const norm = normalizeActivity(comment) as NormalizedActivity;
assert.equal(norm.kind, "comment");
assert.equal(
  isMeaningfulReview(norm, { uuid: "{author}" }),
  true,
);
assert.equal(
  isMeaningfulReview(norm, { uuid: "{reviewer}" }),
  false,
);

const updateOnly: BitbucketActivityItem = {
  update: {
    date: "2024-01-01T12:00:00.000Z",
    author: { uuid: "{reviewer}", nickname: "bob" },
  },
};
const upd = normalizeActivity(updateOnly) as NormalizedActivity;
assert.equal(isMeaningfulReview(upd, { uuid: "{author}" }), false);

console.log("selfcheck ok");
