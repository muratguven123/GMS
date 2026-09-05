/** Internal Bitbucket user identity — never emit in logs or reports. */
export interface BitbucketUserRef {
  uuid?: string;
  account_id?: string;
  nickname?: string;
  display_name?: string;
  username?: string;
  type?: string;
}

export interface BitbucketPullRequest {
  id: number;
  title?: string;
  state: string;
  created_on: string;
  updated_on?: string;
  /** Present on merged PRs when available. */
  merged_on?: string | null;
  closed_on?: string | null;
  author: BitbucketUserRef;
}

export interface BitbucketPaginated<T> {
  values: T[];
  next?: string;
  size?: number;
  page?: number;
  pagelen?: number;
}

/** Raw activity entry shapes from /pullrequests/{id}/activity */
export interface BitbucketActivityItem {
  comment?: {
    id?: number;
    created_on: string;
    user?: BitbucketUserRef;
    content?: { raw?: string };
    deleted?: boolean;
  };
  approval?: {
    date: string;
    user?: BitbucketUserRef;
  };
  changes_requested?: {
    date: string;
    user?: BitbucketUserRef;
  };
  update?: {
    date: string;
    author?: BitbucketUserRef;
    state?: string;
  };
}

export interface AuthorIdentity {
  uuid?: string;
  accountId?: string;
}

export type ActivityKind = "comment" | "approval" | "changes_requested" | "update" | "unknown";

export interface NormalizedActivity {
  kind: ActivityKind;
  at: Date;
  actor: AuthorIdentity & { nickname?: string; username?: string; displayName?: string };
}

export interface PrTimingSample {
  createdOn: Date;
  mergedOn: Date;
  firstMeaningfulReviewAt?: Date;
  firstApprovalAt?: Date;
}

export interface StatSummary {
  n: number;
  avgHours: number | null;
  p50Hours: number | null;
  p90Hours: number | null;
}

export interface AggregateMetrics {
  ttfr: StatSummary;
  reviewCycle: StatSummary;
  leadTime: StatSummary;
}

export interface ReportMeta {
  workspace: string;
  /** Comma-joined repo slugs (stable scope key for snapshots/history). */
  repoSlug: string;
  repos: string[];
  sampleSize: number;
  createdRangeStart: string | null;
  createdRangeEnd: string | null;
  generatedAt: string;
  contractVersion: string;
}

export type GuardSeverity = "low" | "medium" | "high";

export type FailOnLevel = "none" | GuardSeverity;

export interface GuardFinding {
  code: string;
  severity: GuardSeverity;
  message: string;
}

export interface MetricsSnapshot {
  contractVersion: string;
  workspace: string;
  repoSlug: string;
  sampleSize: number;
  createdRangeStart: string | null;
  createdRangeEnd: string | null;
  generatedAt: string;
  integritySha256: string;
  metrics: AggregateMetrics;
}

export interface MetricsHistory {
  workspace: string;
  repoSlug: string;
  entries: MetricsSnapshot[];
}

export interface RepoMetricsResult {
  repoSlug: string;
  sampleSize: number;
  metrics: AggregateMetrics;
  samples: PrTimingSample[];
}

export interface AppConfig {
  token: string;
  username?: string;
  workspace: string;
  /** One or more repository slugs. */
  repoSlugs: string[];
  limit: number;
  out: string;
  concurrency: number;
  failOn: FailOnLevel;
  historyLimit: number;
}
