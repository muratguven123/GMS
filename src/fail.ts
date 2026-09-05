import type { FailOnLevel, GuardFinding, GuardSeverity } from "./types.js";

const RANK: Record<FailOnLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function severityRank(severity: GuardSeverity): number {
  return RANK[severity];
}

/** True when any finding meets or exceeds the configured fail-on threshold. */
export function shouldFailOn(guards: GuardFinding[], failOn: FailOnLevel): boolean {
  if (failOn === "none") return false;
  const threshold = RANK[failOn];
  return guards.some((g) => severityRank(g.severity) >= threshold);
}
