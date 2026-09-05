import { createHash } from "node:crypto";
import { METRIC_CONTRACT_VERSION } from "./contract.js";
import type { AggregateMetrics, ReportMeta } from "./types.js";

/** Canonical payload used for tamper-evident fingerprints (no PII). */
export function buildIntegrityPayload(
  metrics: AggregateMetrics,
  meta: ReportMeta,
): Record<string, unknown> {
  return {
    contractVersion: METRIC_CONTRACT_VERSION,
    workspace: meta.workspace,
    repoSlug: meta.repoSlug,
    sampleSize: meta.sampleSize,
    createdRangeStart: meta.createdRangeStart,
    createdRangeEnd: meta.createdRangeEnd,
    generatedAt: meta.generatedAt,
    metrics: {
      ttfr: metrics.ttfr,
      reviewCycle: metrics.reviewCycle,
      leadTime: metrics.leadTime,
    },
  };
}

export function fingerprintPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildIntegrityBlock(
  metrics: AggregateMetrics,
  meta: ReportMeta,
): { contractVersion: string; sha256: string } {
  const payload = buildIntegrityPayload(metrics, meta);
  return {
    contractVersion: METRIC_CONTRACT_VERSION,
    sha256: fingerprintPayload(payload),
  };
}
