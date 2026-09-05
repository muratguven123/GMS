import { readFile, writeFile } from "node:fs/promises";
import chalk from "chalk";
import Table from "cli-table3";
import { METRIC_CONTRACT } from "./contract.js";
import { buildInsights } from "./insights.js";
import type {
  AggregateMetrics,
  GuardFinding,
  MetricsHistory,
  MetricsSnapshot,
  ReportMeta,
  RepoMetricsResult,
  StatSummary,
} from "./types.js";

function fmtHours(v: number | null): string {
  if (v == null || Number.isNaN(v)) return "n/a";
  return v.toFixed(2);
}

function metricRows(metrics: AggregateMetrics): Array<{
  name: string;
  stats: StatSummary;
}> {
  return [
    { name: "Time to First Review (TTFR)", stats: metrics.ttfr },
    { name: "Review Cycle Time", stats: metrics.reviewCycle },
    { name: "PR Lead Time (Time to Merge)", stats: metrics.leadTime },
  ];
}

function severityPaint(severity: GuardFinding["severity"], text: string): string {
  if (severity === "high") return chalk.red(text);
  if (severity === "medium") return chalk.yellow(text);
  return chalk.dim(text);
}

function scopeLabel(meta: ReportMeta): string {
  if (meta.repos.length <= 1) return `${meta.workspace}/${meta.repos[0] ?? meta.repoSlug}`;
  return `${meta.workspace}/[${meta.repos.length} repos]`;
}

export function printTerminalReport(opts: {
  metrics: AggregateMetrics;
  meta: ReportMeta;
  integritySha256: string;
  guards: GuardFinding[];
  perRepo: RepoMetricsResult[];
  history: MetricsHistory;
}): void {
  const { metrics, meta, integritySha256, guards, perRepo, history } = opts;

  console.log("");
  console.log(chalk.bold("Bitbucket PR process metrics (aggregate only)"));
  console.log(
    chalk.dim(
      `${scopeLabel(meta)} · sample n=${meta.sampleSize} · contract v${meta.contractVersion} · generated ${meta.generatedAt}`,
    ),
  );
  if (meta.repos.length > 1) {
    console.log(chalk.dim(`Repos: ${meta.repos.join(", ")}`));
  }
  if (meta.createdRangeStart && meta.createdRangeEnd) {
    console.log(
      chalk.dim(`PR created_on range: ${meta.createdRangeStart} → ${meta.createdRangeEnd}`),
    );
  }
  console.log(chalk.dim(`Integrity SHA-256: ${integritySha256}`));
  console.log(
    chalk.dim(
      "Privacy: no usernames, IDs, or individual rankings are included in this output.",
    ),
  );
  console.log("");

  printMetricsTable("Portfolio / overall", metrics);

  if (perRepo.length > 1) {
    for (const repo of perRepo) {
      printMetricsTable(repo.repoSlug, repo.metrics);
    }
  }

  printTrendTable(history);

  if (guards.length > 0) {
    console.log(chalk.bold("Manipulation / drift guards"));
    for (const g of guards) {
      console.log(
        severityPaint(g.severity, `  [${g.severity}] ${g.code}: ${g.message}`),
      );
    }
    console.log("");
  }
}

function printMetricsTable(title: string, metrics: AggregateMetrics): void {
  console.log(chalk.bold(title));
  const table = new Table({
    head: [
      chalk.cyan("Metric"),
      chalk.cyan("n"),
      chalk.cyan("avg (h)"),
      chalk.cyan("p50 (h)"),
      chalk.cyan("p90 (h)"),
    ],
    style: { head: [], border: [] },
  });

  for (const row of metricRows(metrics)) {
    table.push([
      row.name,
      String(row.stats.n),
      fmtHours(row.stats.avgHours),
      fmtHours(row.stats.p50Hours),
      fmtHours(row.stats.p90Hours),
    ]);
  }

  console.log(table.toString());
  console.log("");
}

function printTrendTable(history: MetricsHistory): void {
  if (history.entries.length < 2) return;

  console.log(chalk.bold("Trend (p50 hours, recent runs)"));
  const table = new Table({
    head: [
      chalk.cyan("generatedAt"),
      chalk.cyan("n"),
      chalk.cyan("TTFR p50"),
      chalk.cyan("Cycle p50"),
      chalk.cyan("Lead p50"),
    ],
    style: { head: [], border: [] },
  });

  for (const e of history.entries) {
    table.push([
      e.generatedAt,
      String(e.sampleSize),
      fmtHours(e.metrics.ttfr.p50Hours),
      fmtHours(e.metrics.reviewCycle.p50Hours),
      fmtHours(e.metrics.leadTime.p50Hours),
    ]);
  }

  console.log(table.toString());
  console.log("");
}

function markdownTable(metrics: AggregateMetrics): string {
  const lines = [
    "| Metric | n | avg (h) | p50 (h) | p90 (h) |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const row of metricRows(metrics)) {
    lines.push(
      `| ${row.name} | ${row.stats.n} | ${fmtHours(row.stats.avgHours)} | ${fmtHours(row.stats.p50Hours)} | ${fmtHours(row.stats.p90Hours)} |`,
    );
  }
  return lines.join("\n");
}

function markdownTrend(history: MetricsHistory): string {
  if (history.entries.length < 2) {
    return "_Not enough runs yet for a trend (need at least two snapshots in history)._";
  }
  const lines = [
    "| generatedAt | n | TTFR p50 (h) | Cycle p50 (h) | Lead p50 (h) |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const e of history.entries) {
    lines.push(
      `| ${e.generatedAt} | ${e.sampleSize} | ${fmtHours(e.metrics.ttfr.p50Hours)} | ${fmtHours(e.metrics.reviewCycle.p50Hours)} | ${fmtHours(e.metrics.leadTime.p50Hours)} |`,
    );
  }
  return lines.join("\n");
}

export function buildMarkdownReport(opts: {
  metrics: AggregateMetrics;
  meta: ReportMeta;
  integritySha256: string;
  guards: GuardFinding[];
  perRepo: RepoMetricsResult[];
  history: MetricsHistory;
}): string {
  const { metrics, meta, integritySha256, guards, perRepo, history } = opts;
  const insights = buildInsights(metrics);
  const range =
    meta.createdRangeStart && meta.createdRangeEnd
      ? `${meta.createdRangeStart} → ${meta.createdRangeEnd}`
      : "n/a";

  const guardSection =
    guards.length === 0
      ? "- No manipulation or drift signals fired for this sample."
      : guards
          .map((g) => `- **[${g.severity}]** \`${g.code}\`: ${g.message}`)
          .join("\n");

  const perRepoSection =
    perRepo.length > 1
      ? perRepo
          .map(
            (r) => `### \`${r.repoSlug}\` (n=${r.sampleSize})

${markdownTable(r.metrics)}`,
          )
          .join("\n\n")
      : "";

  return `# Bitbucket PR process metrics

**Scope:** \`${scopeLabel(meta)}\`  
**Repos:** ${meta.repos.map((r) => `\`${r}\``).join(", ")}  
**Sample:** ${meta.sampleSize} merged pull requests  
**PR created_on range:** ${range}  
**Generated:** ${meta.generatedAt}  
**Metric contract:** v${meta.contractVersion}  
**Integrity SHA-256:** \`${integritySha256}\`

> Privacy: this report contains **repository-level aggregates only**. It must not be used to evaluate individuals. Usernames, account IDs, and per-person rankings are intentionally omitted.

> Integrity: the SHA-256 fingerprints the contract version, scope, sample bounds, and aggregate numbers. Re-running the same inputs with this tool version should reproduce the hash; hand-edited metric tables will not match a regenerated fingerprint.

## Metrics (hours)

${markdownTable(metrics)}

${perRepoSection ? `## Per-repository metrics\n\n${perRepoSection}\n` : ""}
## Trend (recent runs)

${markdownTrend(history)}

## Definitions (contract v${meta.contractVersion})

- **TTFR:** ${METRIC_CONTRACT.definitions.ttfr}
- **Review Cycle Time:** ${METRIC_CONTRACT.definitions.reviewCycle}
- **PR Lead Time:** ${METRIC_CONTRACT.definitions.leadTime}

Source of truth: ${METRIC_CONTRACT.sourceOfTruth}. Aggregation: ${METRIC_CONTRACT.aggregation.join(", ")} (${METRIC_CONTRACT.percentileMethod}).

## Manipulation & drift guards

${guardSection}

## Process insights

${insights.map((i) => `- ${i}`).join("\n")}
`;
}

export function snapshotPathForReport(outPath: string): string {
  if (outPath.toLowerCase().endsWith(".md")) {
    return `${outPath.slice(0, -3)}.snapshot.json`;
  }
  return `${outPath}.snapshot.json`;
}

export async function loadPreviousSnapshot(
  snapshotPath: string,
): Promise<MetricsSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath, "utf8");
    return JSON.parse(raw) as MetricsSnapshot;
  } catch {
    return null;
  }
}

export async function writeMarkdownReport(
  outPath: string,
  opts: {
    metrics: AggregateMetrics;
    meta: ReportMeta;
    integritySha256: string;
    guards: GuardFinding[];
    perRepo: RepoMetricsResult[];
    history: MetricsHistory;
  },
): Promise<void> {
  const body = buildMarkdownReport(opts);
  await writeFile(outPath, body, "utf8");
  console.log(chalk.green(`Wrote markdown report: ${outPath}`));
}

export async function writeSnapshot(
  snapshot: MetricsSnapshot,
  snapshotPath: string,
): Promise<void> {
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(chalk.green(`Wrote metrics snapshot: ${snapshotPath}`));
}
