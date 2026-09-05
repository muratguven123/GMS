import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import Table from "cli-table3";
import { buildInsights } from "./insights.js";
import type { AggregateMetrics, ReportMeta, StatSummary } from "./types.js";

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

export function printTerminalTable(metrics: AggregateMetrics, meta: ReportMeta): void {
  console.log("");
  console.log(chalk.bold("Bitbucket PR process metrics (aggregate only)"));
  console.log(
    chalk.dim(
      `${meta.workspace}/${meta.repoSlug} · sample n=${meta.sampleSize} · generated ${meta.generatedAt}`,
    ),
  );
  if (meta.createdRangeStart && meta.createdRangeEnd) {
    console.log(
      chalk.dim(`PR created_on range: ${meta.createdRangeStart} → ${meta.createdRangeEnd}`),
    );
  }
  console.log(
    chalk.dim(
      "Privacy: no usernames, IDs, or individual rankings are included in this output.",
    ),
  );
  console.log("");

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

export function buildMarkdownReport(metrics: AggregateMetrics, meta: ReportMeta): string {
  const insights = buildInsights(metrics);
  const range =
    meta.createdRangeStart && meta.createdRangeEnd
      ? `${meta.createdRangeStart} → ${meta.createdRangeEnd}`
      : "n/a";

  return `# Bitbucket PR process metrics

**Scope:** \`${meta.workspace}/${meta.repoSlug}\`  
**Sample:** ${meta.sampleSize} merged pull requests  
**PR created_on range:** ${range}  
**Generated:** ${meta.generatedAt}

> Privacy: this report contains **repository-level aggregates only**. It must not be used to evaluate individuals. Usernames, account IDs, and per-person rankings are intentionally omitted.

## Metrics (hours)

${markdownTable(metrics)}

## Definitions

- **Time to First Review (TTFR):** time from PR open to the first meaningful human review activity (comment, approval, or changes requested), excluding the PR author, known bots, and branch/update noise.
- **Review Cycle Time:** time from that first meaningful review to the first non-author approval.
- **PR Lead Time:** time from PR open to merge (\`merged_on\`, falling back to \`closed_on\` / \`updated_on\` when needed).

PRs without a qualifying first review are excluded from TTFR. PRs without both a first review and an approval are excluded from Review Cycle Time. Lead Time includes all sampled merged PRs with a resolvable merge timestamp.

## Process insights

${insights.map((i) => `- ${i}`).join("\n")}
`;
}

export async function writeMarkdownReport(
  metrics: AggregateMetrics,
  meta: ReportMeta,
  outPath: string,
): Promise<void> {
  const body = buildMarkdownReport(metrics, meta);
  await writeFile(outPath, body, "utf8");
  console.log(chalk.green(`Wrote markdown report: ${outPath}`));
}
