import type { AggregateMetrics } from "./types.js";

/**
 * Process-level improvement hints based on aggregate percentiles only.
 * No individual or ranking language.
 */
export function buildInsights(metrics: AggregateMetrics): string[] {
  const insights: string[] = [];

  const ttfrP90 = metrics.ttfr.p90Hours;
  const cycleP90 = metrics.reviewCycle.p90Hours;
  const leadP90 = metrics.leadTime.p90Hours;
  const leadP50 = metrics.leadTime.p50Hours;
  const ttfrP50 = metrics.ttfr.p50Hours;

  if (ttfrP90 != null && ttfrP90 > 24) {
    insights.push(
      "Time to First Review p90 exceeds 24 hours — consider review WIP limits, clearer ownership of the review queue, or smaller PRs to shorten wait time before the first human look.",
    );
  } else if (ttfrP50 != null && ttfrP50 > 8) {
    insights.push(
      "Median Time to First Review is above 8 hours — tightening SLAs for first response and reducing open review backlog may help.",
    );
  }

  if (cycleP90 != null && cycleP90 > 48) {
    insights.push(
      "Review Cycle Time p90 is high — long gaps between first feedback and approval often indicate large diffs, unclear acceptance criteria, or approval bottlenecks; prefer smaller, focused changes.",
    );
  } else if (cycleP90 != null && cycleP90 > 24) {
    insights.push(
      "Review Cycle Time p90 exceeds one day — check whether rework loops or multi-approver gates are stretching the path to approval.",
    );
  }

  if (leadP90 != null && leadP50 != null && leadP90 > leadP50 * 3 && leadP50 > 0) {
    insights.push(
      "Lead Time p90 is much higher than the median — a long tail of slow merges suggests occasional blocked or oversized PRs; investigate process stalls rather than individual throughput.",
    );
  }

  if (leadP90 != null && leadP90 > 120) {
    insights.push(
      "PR Lead Time p90 exceeds five days — end-to-end delivery is slow; map wait states (review queue, CI, merge freezes) at the team/repo level.",
    );
  }

  if (metrics.ttfr.n === 0) {
    insights.push(
      "No meaningful first-review events were found in the sample after filtering bots, author comments, and branch updates — verify review practices or bot filter coverage.",
    );
  }

  if (metrics.reviewCycle.n === 0 && metrics.ttfr.n > 0) {
    insights.push(
      "First reviews exist but approvals are scarce in activity data — confirm that approvals are recorded in Bitbucket (not only external tools).",
    );
  }

  if (insights.length === 0) {
    insights.push(
      "Aggregate timings look healthy relative to common thresholds — keep monitoring p90 alongside medians to catch emerging review or merge queues early.",
    );
  }

  return insights;
}
