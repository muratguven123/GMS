import {
  extractAuthorIdentity,
  isApprovalActivity,
  isMeaningfulReview,
  normalizeActivity,
} from "./filters.js";
import type {
  AggregateMetrics,
  BitbucketActivityItem,
  BitbucketPullRequest,
  PrTimingSample,
  StatSummary,
} from "./types.js";

const MS_PER_HOUR = 1000 * 60 * 60;

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Linear-interpolated percentile; `p` in [0, 100]. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

export function summarizeHours(hours: number[]): StatSummary {
  return {
    n: hours.length,
    avgHours: mean(hours),
    p50Hours: percentile(hours, 50),
    p90Hours: percentile(hours, 90),
  };
}

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
}

function resolveMergedOn(pr: BitbucketPullRequest): Date | null {
  const raw = pr.merged_on ?? pr.closed_on ?? pr.updated_on;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildPrTimingSample(
  pr: BitbucketPullRequest,
  activityItems: BitbucketActivityItem[],
): PrTimingSample | null {
  const createdOn = new Date(pr.created_on);
  if (Number.isNaN(createdOn.getTime())) return null;

  const mergedOn = resolveMergedOn(pr);
  if (!mergedOn) return null;

  const author = extractAuthorIdentity(pr.author);
  const normalized = activityItems
    .map(normalizeActivity)
    .filter((a): a is NonNullable<typeof a> => a !== null && !Number.isNaN(a.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  let firstMeaningfulReviewAt: Date | undefined;
  let firstApprovalAt: Date | undefined;

  for (const activity of normalized) {
    if (!firstMeaningfulReviewAt && isMeaningfulReview(activity, author)) {
      firstMeaningfulReviewAt = activity.at;
    }
    if (!firstApprovalAt && isApprovalActivity(activity, author)) {
      firstApprovalAt = activity.at;
    }
    if (firstMeaningfulReviewAt && firstApprovalAt) break;
  }

  return {
    createdOn,
    mergedOn,
    firstMeaningfulReviewAt,
    firstApprovalAt,
  };
}

export function aggregateMetrics(samples: PrTimingSample[]): AggregateMetrics {
  const ttfr: number[] = [];
  const reviewCycle: number[] = [];
  const leadTime: number[] = [];

  for (const s of samples) {
    const lead = hoursBetween(s.createdOn, s.mergedOn);
    if (lead >= 0) leadTime.push(lead);

    if (s.firstMeaningfulReviewAt) {
      const t = hoursBetween(s.createdOn, s.firstMeaningfulReviewAt);
      if (t >= 0) ttfr.push(t);
    }

    if (s.firstMeaningfulReviewAt && s.firstApprovalAt) {
      const cycle = hoursBetween(s.firstMeaningfulReviewAt, s.firstApprovalAt);
      if (cycle >= 0) reviewCycle.push(cycle);
    }
  }

  return {
    ttfr: summarizeHours(ttfr),
    reviewCycle: summarizeHours(reviewCycle),
    leadTime: summarizeHours(leadTime),
  };
}
