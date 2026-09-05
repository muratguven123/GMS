import chalk from "chalk";
import { BitbucketClient, mapPool } from "./client.js";
import { aggregateMetrics, buildPrTimingSample } from "./metrics.js";
import type {
  AppConfig,
  BitbucketPullRequest,
  PrTimingSample,
  RepoMetricsResult,
} from "./types.js";

export async function analyzeRepository(
  config: AppConfig,
  repoSlug: string,
): Promise<RepoMetricsResult> {
  const client = new BitbucketClient({
    token: config.token,
    username: config.username,
    workspace: config.workspace,
    repoSlug,
  });

  console.log(
    chalk.dim(
      `  [${repoSlug}] fetching up to ${config.limit} merged PRs…`,
    ),
  );

  const prs = await client.listMergedPullRequests(config.limit);
  if (prs.length === 0) {
    console.log(chalk.yellow(`  [${repoSlug}] no merged pull requests found.`));
    return {
      repoSlug,
      sampleSize: 0,
      metrics: aggregateMetrics([]),
      samples: [],
    };
  }

  console.log(
    chalk.dim(
      `  [${repoSlug}] loaded ${prs.length} PRs; fetching activity (concurrency=${config.concurrency})…`,
    ),
  );

  const samples = await mapPool(prs, config.concurrency, async (pr: BitbucketPullRequest) => {
    try {
      const activity = await client.listPullRequestActivity(pr.id);
      return buildPrTimingSample(pr, activity);
    } catch {
      return null;
    }
  });

  const validSamples = samples.filter((s): s is PrTimingSample => s !== null);
  return {
    repoSlug,
    sampleSize: validSamples.length,
    metrics: aggregateMetrics(validSamples),
    samples: validSamples,
  };
}
