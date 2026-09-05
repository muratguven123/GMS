/**
 * Locked metric definitions. Bump METRIC_CONTRACT_VERSION whenever formulas
 * or inclusion rules change so reports cannot silently drift across tool versions.
 */
export const METRIC_CONTRACT_VERSION = "1.1.0";

export const METRIC_CONTRACT = {
  version: METRIC_CONTRACT_VERSION,
  units: "hours",
  sourceOfTruth: "Bitbucket Cloud REST API 2.0 (merged PRs + activity)",
  privacy: "repository-level aggregates only; no individual attribution",
  definitions: {
    ttfr:
      "created_on → first meaningful human review (comment | approval | changes_requested); excludes PR author, known bots, and update-only events",
    reviewCycle:
      "first meaningful review → first non-author, non-bot approval; excluded if either timestamp missing",
    leadTime:
      "created_on → merged_on (fallback closed_on, then updated_on); all resolvable merged samples",
  },
  aggregation: ["mean", "p50", "p90"],
  percentileMethod: "linear_interpolation_sorted",
} as const;
