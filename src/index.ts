#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { analyzeRepository } from "./analyze.js";
import { resolveConfig, scopeRepoSlug } from "./config.js";
import { METRIC_CONTRACT_VERSION } from "./contract.js";
import { shouldFailOn } from "./fail.js";
import {
  buildSnapshot,
  detectDrift,
  detectManipulationSignals,
} from "./guards.js";
import {
  appendHistoryEntry,
  historyPathForReport,
  loadHistory,
  writeHistory,
} from "./history.js";
import { buildIntegrityBlock } from "./integrity.js";
import { aggregateMetrics } from "./metrics.js";
import {
  loadPreviousSnapshot,
  printTerminalReport,
  snapshotPathForReport,
  writeMarkdownReport,
  writeSnapshot,
} from "./report.js";
import type { PrTimingSample, ReportMeta } from "./types.js";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("bitbucket-pr-metrics")
    .description(
      "Aggregate Bitbucket merged-PR delivery metrics (TTFR, review cycle, lead time). No individual attribution. Multi-repo, trend history, and --fail-on guards.",
    )
    .option("-w, --workspace <slug>", "Bitbucket workspace (overrides BITBUCKET_WORKSPACE)")
    .option(
      "-r, --repo <slugs>",
      "Repository slug(s), comma-separated (overrides BITBUCKET_REPO_SLUG / BITBUCKET_REPO_SLUGS)",
    )
    .option("--repos <slugs>", "Alias for --repo (comma-separated)")
    .option("-l, --limit <n>", "Max merged PRs to sample per repo", (v) => parseInt(v, 10), 100)
    .option("-o, --out <path>", "Markdown report path", "metrics-report.md")
    .option(
      "-c, --concurrency <n>",
      "Parallel activity fetches per repo",
      (v) => parseInt(v, 10),
      5,
    )
    .option(
      "--fail-on <level>",
      "Exit non-zero if a guard at this severity or higher fires (none|low|medium|high)",
      "none",
    )
    .option(
      "--history-limit <n>",
      "Max trend history entries to retain",
      (v) => parseInt(v, 10),
      12,
    )
    .parse(process.argv);

  const opts = program.opts<{
    workspace?: string;
    repo?: string;
    repos?: string;
    limit: number;
    out: string;
    concurrency: number;
    failOn: string;
    historyLimit: number;
  }>();

  const config = resolveConfig(opts);
  const scope = scopeRepoSlug(config.repoSlugs);

  console.log(
    chalk.dim(
      `Analyzing ${config.workspace} repos=[${config.repoSlugs.join(", ")}] (contract v${METRIC_CONTRACT_VERSION}, fail-on=${config.failOn})…`,
    ),
  );

  const perRepo = [];
  for (const repoSlug of config.repoSlugs) {
    perRepo.push(await analyzeRepository(config, repoSlug));
  }

  const allSamples: PrTimingSample[] = perRepo.flatMap((r) => r.samples);
  const metrics = aggregateMetrics(allSamples);

  const createdTimes = allSamples.map((s) => s.createdOn.getTime());
  const minCreated =
    createdTimes.length > 0 ? new Date(Math.min(...createdTimes)).toISOString() : null;
  const maxCreated =
    createdTimes.length > 0 ? new Date(Math.max(...createdTimes)).toISOString() : null;

  const meta: ReportMeta = {
    workspace: config.workspace,
    repoSlug: scope,
    repos: config.repoSlugs,
    sampleSize: allSamples.length,
    createdRangeStart: minCreated,
    createdRangeEnd: maxCreated,
    generatedAt: new Date().toISOString(),
    contractVersion: METRIC_CONTRACT_VERSION,
  };

  const integrity = buildIntegrityBlock(metrics, meta);
  const snapPath = snapshotPathForReport(config.out);
  const histPath = historyPathForReport(config.out);
  const existingHistory = await loadHistory(histPath);
  const fileSnapshot = await loadPreviousSnapshot(snapPath);
  const previous =
    existingHistory && existingHistory.entries.length > 0
      ? existingHistory.entries[existingHistory.entries.length - 1]
      : fileSnapshot;

  const guards = [
    ...detectManipulationSignals(allSamples, metrics),
    ...detectDrift(metrics, meta, previous),
  ];

  if (allSamples.length === 0) {
    console.log(chalk.yellow("No valid timing samples across selected repositories."));
    printTerminalReport({
      metrics,
      meta,
      integritySha256: integrity.sha256,
      guards,
      perRepo,
      history: existingHistory ?? {
        workspace: meta.workspace,
        repoSlug: meta.repoSlug,
        entries: [],
      },
    });
    if (shouldFailOn(guards, config.failOn)) {
      process.exitCode = 1;
    }
    return;
  }

  const snapshot = buildSnapshot(metrics, meta, integrity.sha256);
  const history = appendHistoryEntry(existingHistory, snapshot, config.historyLimit);

  printTerminalReport({
    metrics,
    meta,
    integritySha256: integrity.sha256,
    guards,
    perRepo,
    history,
  });

  await writeMarkdownReport(config.out, {
    metrics,
    meta,
    integritySha256: integrity.sha256,
    guards,
    perRepo,
    history,
  });
  await writeSnapshot(snapshot, snapPath);
  await writeHistory(history, histPath);
  console.log(chalk.green(`Wrote metrics history: ${histPath}`));

  if (shouldFailOn(guards, config.failOn)) {
    const triggered = guards.filter((g) =>
      shouldFailOn([g], config.failOn),
    );
    console.error(
      chalk.red(
        `Failing: ${triggered.length} guard(s) met --fail-on=${config.failOn} (e.g. ${triggered[0]?.code ?? "unknown"}).`,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Unexpected error.";
  console.error(chalk.red(message));
  process.exitCode = 1;
});
