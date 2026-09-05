# Bitbucket PR Metrics CLI

Aggregate **process** metrics for merged pull requests on Bitbucket Cloud.  
Designed for team/repo delivery health — **not** for measuring individuals.

## Privacy

- Outputs never include usernames, account IDs, or per-person rankings.
- All numbers are repository-level **average / p50 / p90**.
- Author identity is used only in-memory to exclude self-reviews from TTFR.

## Metrics

| Metric | Meaning |
| --- | --- |
| **TTFR** | Open → first meaningful human review (not author, not bot, not branch update) |
| **Review Cycle Time** | First meaningful review → first approval |
| **PR Lead Time** | Open → merge |

## Features

### Multi-repo
Pass several slugs (comma-separated). The tool reports **portfolio** aggregates plus a per-repo section.

```bash
npm run analyze -- --repo api,web,worker
# or
# BITBUCKET_REPO_SLUGS=api,web,worker
```

### Trend history
Each run appends to `metrics-report.history.json` (last N entries, default 12) and prints a p50 trend table when at least two runs exist.

### Manipulation & drift guards
| Control | What it does |
| --- | --- |
| **Metric contract version** | Locked definitions in `src/contract.ts` |
| **Integrity SHA-256** | Fingerprints contract + scope + aggregates |
| **Manipulation signals** | e.g. high share of &lt;5 min TTFR, near-zero cycles |
| **Drift vs prior run** | p50 swings vs previous snapshot/history |

### CI fail-on
```bash
npm run analyze -- --fail-on high
# or BITBUCKET_METRICS_FAIL_ON=high
```
Exits non-zero if any guard at that severity **or higher** fires (`none` \| `low` \| `medium` \| `high`).

## Setup

```bash
cd bitbucket-pr-metrics
npm install
cp .env.example .env
```

```env
BITBUCKET_TOKEN=...
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_REPO_SLUG=your-repo
# BITBUCKET_REPO_SLUGS=repo-a,repo-b
# BITBUCKET_USERNAME=...          # App Password → Basic Auth
# BITBUCKET_METRICS_FAIL_ON=high
```

## Usage

```bash
npm run analyze
npx tsx src/index.ts --repo api,web --limit 100 --fail-on medium --out metrics-report.md
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `--workspace` / `-w` | env | Workspace slug |
| `--repo` / `--repos` / `-r` | env | One or more repo slugs (comma-separated) |
| `--limit` / `-l` | `100` | Max merged PRs **per repo** |
| `--out` / `-o` | `metrics-report.md` | Markdown report path |
| `--concurrency` / `-c` | `5` | Parallel activity API calls per repo |
| `--fail-on` | `none` | CI severity threshold |
| `--history-limit` | `12` | Trend entries to retain |

## Output

1. Terminal tables (portfolio, optional per-repo, trend, guards).
2. `metrics-report.md`
3. `metrics-report.snapshot.json` — latest snapshot for drift
4. `metrics-report.history.json` — rolling trend history

## Project layout

```
src/
  index.ts      CLI entry
  analyze.ts    Per-repo fetch + sample build
  config.ts     Env / flags (multi-repo, fail-on)
  client.ts     Bitbucket REST client
  filters.ts    Bot / author / update noise filters
  metrics.ts    Aggregations + percentiles
  contract.ts   Locked metric definitions
  integrity.ts  SHA-256 fingerprint
  guards.ts     Manipulation + drift signals
  fail.ts       --fail-on threshold helper
  history.ts    Trend history I/O
  report.ts     Tables + markdown
  insights.ts   Process hints
  types.ts      Shared types
```
