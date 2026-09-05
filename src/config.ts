import { config as loadDotenv } from "dotenv";
import type { AppConfig } from "./types.js";

loadDotenv();

export function resolveConfig(opts: {
  workspace?: string;
  repo?: string;
  limit?: number;
  out?: string;
  concurrency?: number;
}): AppConfig {
  const token = process.env.BITBUCKET_TOKEN?.trim();
  const workspace = (opts.workspace ?? process.env.BITBUCKET_WORKSPACE)?.trim();
  const repoSlug = (opts.repo ?? process.env.BITBUCKET_REPO_SLUG)?.trim();
  const username = process.env.BITBUCKET_USERNAME?.trim() || undefined;

  if (!token) {
    throw new Error("BITBUCKET_TOKEN is required (env or .env file).");
  }
  if (!workspace) {
    throw new Error("Workspace is required (--workspace or BITBUCKET_WORKSPACE).");
  }
  if (!repoSlug) {
    throw new Error("Repo slug is required (--repo or BITBUCKET_REPO_SLUG).");
  }

  const limit = opts.limit ?? 100;
  const concurrency = opts.concurrency ?? 5;
  const out = opts.out ?? "metrics-report.md";

  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  return {
    token,
    username,
    workspace,
    repoSlug,
    limit: Math.floor(limit),
    out,
    concurrency: Math.floor(concurrency),
  };
}
