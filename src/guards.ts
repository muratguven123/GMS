import type {
  AggregateMetrics,
  GuardFinding,
  MetricsSnapshot,
  PrTimingSample,
  ReportMeta,
} from "./types.js";

const MS_PER_HOUR = 1000 * 60 * 60;

/** Instant "review" threshold — likely rubber-stamp / pre-arranged signal. */
const INSTANT_REVIEW_HOURS = 5 / 60; // 5 minutes
/** Relative p50 move vs previous snapshot that counts as process drift. */
const DRIFT_RELATIVE_THRESHOLD = 0.5; // 50%
const DRIFT_MIN_ABS_HOURS = 1;

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

/**
 * Aggregate-only signals for metric gaming / data quality issues.
 * Never attributes findings to individuals.
 */
export function detectManipulationSignals(
  samples: PrTimingSample[],
  metrics: AggregateMetrics,
): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const n = samples.length;
  if (n === 0) {
    findings.push({
      code: "EMPTY_SAMPLE",
      severity: "high",
      message:
        "No valid timing samples — report must not be treated as a delivery signal.",
    });
    return findings;
  }

  let instantTtfr = 0;
  let zeroCycle = 0;
  let inconsistentOrder = 0;
  let withTtfr = 0;
  let withCycle = 0;

  for (const s of samples) {
    if (s.firstMeaningfulReviewAt) {
      withTtfr += 1;
      const ttfr = hoursBetween(s.createdOn, s.firstMeaningfulReviewAt);
      if (ttfr >= 0 && ttfr < INSTANT_REVIEW_HOURS) instantTtfr += 1;
    }
    if (s.firstMeaningfulReviewAt && s.firstApprovalAt) {
      withCycle += 1;
      const cycle = hoursBetween(s.firstMeaningfulReviewAt, s.firstApprovalAt);
      if (cycle === 0 || (cycle >= 0 && cycle < INSTANT_REVIEW_HOURS)) zeroCycle += 1;
    }
    if (
      s.firstMeaningfulReviewAt &&
      s.firstMeaningfulReviewAt.getTime() > s.mergedOn.getTime()
    ) {
      inconsistentOrder += 1;
    }
  }

  const instantRate = rate(instantTtfr, withTtfr || n);
  if (withTtfr >= 10 && instantRate >= 0.4) {
    findings.push({
      code: "HIGH_INSTANT_TTFR_RATE",
      severity: "high",
      message: `${Math.round(instantRate * 100)}% of TTFR samples are under 5 minutes — possible rubber-stamp or pre-arranged first reviews inflating responsiveness.`,
    });
  } else if (withTtfr >= 10 && instantRate >= 0.25) {
    findings.push({
      code: "ELEVATED_INSTANT_TTFR_RATE",
      severity: "medium",
      message: `${Math.round(instantRate * 100)}% of TTFR samples are under 5 minutes — watch for review theater that shortens TTFR without real scrutiny.`,
    });
  }

  const zeroCycleRate = rate(zeroCycle, withCycle || n);
  if (withCycle >= 10 && zeroCycleRate >= 0.5) {
    findings.push({
      code: "HIGH_ZERO_CYCLE_RATE",
      severity: "high",
      message: `${Math.round(zeroCycleRate * 100)}% of review cycles are near-zero — approvals may be coinciding with first look (weak review-cycle signal).`,
    });
  }

  const ttfrCoverage = rate(metrics.ttfr.n, n);
  if (ttfrCoverage < 0.5 && n >= 20) {
    findings.push({
      code: "LOW_TTFR_COVERAGE",
      severity: "medium",
      message: `Only ${Math.round(ttfrCoverage * 100)}% of sampled PRs contribute to TTFR — aggregates may under-represent wait time if reviews happen outside Bitbucket.`,
    });
  }

  if (
    metrics.ttfr.p50Hours != null &&
    metrics.leadTime.p50Hours != null &&
    metrics.ttfr.p50Hours > metrics.leadTime.p50Hours &&
    metrics.leadTime.n >= 10
  ) {
    findings.push({
      code: "TTFR_EXCEEDS_LEAD_MEDIAN",
      severity: "high",
      message:
        "Median TTFR exceeds median lead time — timing inputs look inconsistent or merge timestamps are unreliable; treat headline metrics with caution.",
    });
  }

  if (
    metrics.leadTime.p90Hours != null &&
    metrics.leadTime.p50Hours != null &&
    metrics.leadTime.p50Hours > 0 &&
    metrics.leadTime.p90Hours > metrics.leadTime.p50Hours * 5
  ) {
    findings.push({
      code: "EXTREME_LEAD_TAIL",
      severity: "medium",
      message:
        "Lead time p90 is more than 5× the median — a heavy tail can dominate averages; prefer p50/p90 together and avoid mean-only storytelling.",
    });
  }

  if (inconsistentOrder > 0) {
    findings.push({
      code: "REVIEW_AFTER_MERGE",
      severity: "medium",
      message: `${inconsistentOrder} sample(s) have first meaningful review after merge — excluded from healthy process interpretation; check activity ordering / backfilled comments.`,
    });
  }

  return findings;
}

function relativeChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return (current - previous) / Math.abs(previous);
}

/**
 * Compare current p50s to a previous snapshot for the same workspace/repo.
 * Large swings flag process drift or sample-composition change (not individuals).
 */
export function detectDrift(
  metrics: AggregateMetrics,
  meta: ReportMeta,
  previous: MetricsSnapshot | null,
): GuardFinding[] {
  if (!previous) return [];
  if (
    previous.workspace !== meta.workspace ||
    previous.repoSlug !== meta.repoSlug
  ) {
    return [
      {
        code: "SNAPSHOT_SCOPE_MISMATCH",
        severity: "low",
        message:
          "Previous snapshot belongs to a different workspace/repo — drift comparison skipped.",
      },
    ];
  }

  if (previous.contractVersion !== meta.contractVersion) {
    return [
      {
        code: "CONTRACT_VERSION_CHANGED",
        severity: "medium",
        message: `Metric contract changed (${previous.contractVersion} → ${meta.contractVersion}); do not compare raw numbers across versions without recalibration.`,
      },
    ];
  }

  const findings: GuardFinding[] = [];
  const pairs: Array<{ key: keyof AggregateMetrics; label: string }> = [
    { key: "ttfr", label: "TTFR" },
    { key: "reviewCycle", label: "Review Cycle Time" },
    { key: "leadTime", label: "PR Lead Time" },
  ];

  for (const { key, label } of pairs) {
    const cur = metrics[key].p50Hours;
    const prev = previous.metrics[key].p50Hours;
    if (cur == null || prev == null) continue;
    const abs = Math.abs(cur - prev);
    const rel = relativeChange(cur, prev);
    if (abs >= DRIFT_MIN_ABS_HOURS && Math.abs(rel) >= DRIFT_RELATIVE_THRESHOLD) {
      const dir = cur > prev ? "increased" : "decreased";
      findings.push({
        code: `DRIFT_${key.toUpperCase()}_P50`,
        severity: Math.abs(rel) >= 1 ? "high" : "medium",
        message: `${label} p50 ${dir} by ${Math.round(Math.abs(rel) * 100)}% vs previous snapshot (${prev.toFixed(2)}h → ${cur.toFixed(2)}h) — investigate process or sample-mix change before celebrating/penalizing the move.`,
      });
    }
  }

  const sampleDelta = Math.abs(meta.sampleSize - previous.sampleSize);
  if (previous.sampleSize > 0 && sampleDelta / previous.sampleSize >= 0.4) {
    findings.push({
      code: "SAMPLE_SIZE_SWING",
      severity: "low",
      message: `Sample size moved from ${previous.sampleSize} to ${meta.sampleSize} — drift may reflect coverage change rather than delivery improvement.`,
    });
  }

  return findings;
}

export function buildSnapshot(
  metrics: AggregateMetrics,
  meta: ReportMeta,
  integritySha256: string,
): MetricsSnapshot {
  return {
    contractVersion: meta.contractVersion,
    workspace: meta.workspace,
    repoSlug: meta.repoSlug,
    sampleSize: meta.sampleSize,
    createdRangeStart: meta.createdRangeStart,
    createdRangeEnd: meta.createdRangeEnd,
    generatedAt: meta.generatedAt,
    integritySha256,
    metrics,
  };
}
