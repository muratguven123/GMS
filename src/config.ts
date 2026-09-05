import { config as loadDotenv } from "dotenv";
import type { AppConfig, FailOnLevel } from "./types.js";

loadDotenv();

const FAIL_ON_LEVELS: FailOnLevel[] = ["none", "low", "medium", "high"];

function parseRepoSlugs(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function parseFailOn(raw: string | undefined, fallback: FailOnLevel): FailOnLevel {
  if (!raw?.trim()) return fallback;
  const v = raw.trim().toLowerCase() as FailOnLevel;
  if (!FAIL_ON_LEVELS.includes(v)) {
    throw new Error(`--fail-on must be one of: ${FAIL_ON_LEVELS.join(", ")}`);
  }
  return v;
}

export function resolveConfig(opts: {
  workspace?: string;
  repo?: string;
  repos?: string;
  limit?: number;
  out?: string;
  concurrency?: number;
  failOn?: string;
  historyLimit?: number;
}): AppConfig {
  const token = process.env.BITBUCKET_TOKEN?.trim();
  const workspace = (opts.workspace ?? process.env.BITBUCKET_WORKSPACE)?.trim();
  const username = process.env.BITBUCKET_USERNAME?.trim() || undefined;

  const fromFlag = parseRepoSlugs(opts.repos ?? opts.repo);
  const fromEnv = parseRepoSlugs(
    process.env.BITBUCKET_REPO_SLUGS ?? process.env.BITBUCKET_REPO_SLUG,
  );
  const repoSlugs = fromFlag.length > 0 ? fromFlag : fromEnv;

  if (!token) {
    throw new Error("BITBUCKET_TOKEN is required (env or .env file).");
  }
  if (!workspace) {
    throw new Error("Workspace is required (--workspace or BITBUCKET_WORKSPACE).");
  }
  if (repoSlugs.length === 0) {
    throw new Error(
      "At least one repo is required (--repo / --repos or BITBUCKET_REPO_SLUG / BITBUCKET_REPO_SLUGS).",
    );
  }

  const limit = opts.limit ?? 100;
  const concurrency = opts.concurrency ?? 5;
  const out = opts.out ?? "metrics-report.md";
  const historyLimit = opts.historyLimit ?? 12;
  const failOn = parseFailOn(
    opts.failOn ?? process.env.BITBUCKET_METRICS_FAIL_ON,
    "none",
  );

  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }
  if (!Number.isFinite(historyLimit) || historyLimit < 1) {
    throw new Error("--history-limit must be a positive integer.");
  }

  return {
    token,
    username,
    workspace,
    repoSlugs,
    limit: Math.floor(limit),
    out,
    concurrency: Math.floor(concurrency),
    failOn,
    historyLimit: Math.floor(historyLimit),
  };
}

export function scopeRepoSlug(repoSlugs: string[]): string {
  return [...repoSlugs].sort().join(",");
}
