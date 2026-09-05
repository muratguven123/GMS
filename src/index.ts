#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { BitbucketClient, mapPool } from "./client.js";
import { resolveConfig } from "./config.js";
import { aggregateMetrics, buildPrTimingSample } from "./metrics.js";
import { printTerminalTable, writeMarkdownReport } from "./report.js";
import type { BitbucketPullRequest, PrTimingSample, ReportMeta } from "./types.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("bitbucket-pr-metrics")
    .description(
      "Aggregate Bitbucket merged-PR delivery metrics (TTFR, review cycle, lead time). No individual attribution.",
    )
    .option("-w, --workspace <slug>", "Bitbucket workspace (overrides BITBUCKET_WORKSPACE)")
    .option("-r, --repo <slug>", "Repository slug (overrides BITBUCKET_REPO_SLUG)")
    .option("-l, --limit <n>", "Max merged PRs to sample", (v) => parseInt(v, 10), 100)
    .option("-o, --out <path>", "Markdown report path", "metrics-report.md")
    .option(
      "-c, --concurrency <n>",
      "Parallel activity fetches",
      (v) => parseInt(v, 10),
      5,
    )
    .parse(process.argv);

  const opts = program.opts<{
    workspace?: string;
    repo?: string;
    limit: number;
    out: string;
    concurrency: number;
  }>();

  const config = resolveConfig(opts);
  const client = new BitbucketClient({
    token: config.token,
    username: config.username,
    workspace: config.workspace,
    repoSlug: config.repoSlug,
  });

  console.log(
    chalk.dim(
      `Fetching up to ${config.limit} merged PRs for ${config.workspace}/${config.repoSlug}…`,
    ),
  );

  const prs = await client.listMergedPullRequests(config.limit);
  if (prs.length === 0) {
    console.log(chalk.yellow("No merged pull requests found."));
    return;
  }

  console.log(chalk.dim(`Loaded ${prs.length} PRs; fetching activity (concurrency=${config.concurrency})…`));

  const samples = await mapPool(prs, config.concurrency, async (pr: BitbucketPullRequest) => {
    try {
      const activity = await client.listPullRequestActivity(pr.id);
      return buildPrTimingSample(pr, activity);
    } catch {
      // Avoid leaking PR titles or identities; count as skipped sample.
      return null;
    }
  });

  const validSamples = samples.filter((s): s is PrTimingSample => s !== null);
  const metrics = aggregateMetrics(validSamples);

  const createdTimes = validSamples.map((s) => s.createdOn.getTime());
  const minCreated =
    createdTimes.length > 0 ? new Date(Math.min(...createdTimes)).toISOString() : null;
  const maxCreated =
    createdTimes.length > 0 ? new Date(Math.max(...createdTimes)).toISOString() : null;

  const meta: ReportMeta = {
    workspace: config.workspace,
    repoSlug: config.repoSlug,
    sampleSize: validSamples.length,
    createdRangeStart: minCreated,
    createdRangeEnd: maxCreated,
    generatedAt: new Date().toISOString(),
  };

  printTerminalTable(metrics, meta);
  await writeMarkdownReport(metrics, meta, config.out);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected error.";
  // Do not dump raw API payloads (may contain usernames).
  console.error(chalk.red(message));
  process.exitCode = 1;
});
