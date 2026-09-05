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

## Setup

```bash
cd bitbucket-pr-metrics
npm install
cp .env.example .env
```

Edit `.env`:

```env
BITBUCKET_TOKEN=...
BITBUCKET_WORKSPACE=your-workspace
BITBUCKET_REPO_SLUG=your-repo

# Optional: App Password mode (Basic Auth)
# BITBUCKET_USERNAME=your-username
```

- **With `BITBUCKET_USERNAME`:** Basic Auth (username + App Password in `BITBUCKET_TOKEN`).
- **Without username:** Bearer token (`Authorization: Bearer …`).

Required Bitbucket scopes typically include pull request **read** access for the repository.

## Usage

```bash
npm run analyze
# or
npx tsx src/index.ts --limit 100 --out metrics-report.md
```

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `--workspace` / `-w` | `BITBUCKET_WORKSPACE` | Workspace slug |
| `--repo` / `-r` | `BITBUCKET_REPO_SLUG` | Repository slug |
| `--limit` / `-l` | `100` | Max merged PRs to sample |
| `--out` / `-o` | `metrics-report.md` | Markdown report path |
| `--concurrency` / `-c` | `5` | Parallel activity API calls |

### Build

```bash
npm run build
npm start -- --limit 50
```

## Output

1. ASCII table in the terminal (n, avg, p50, p90 in hours).
2. `metrics-report.md` with the same aggregates plus process insights.

## Project layout

```
src/
  index.ts      CLI entry
  config.ts     Env / flags
  client.ts     Bitbucket REST client + pagination
  filters.ts    Bot / author / update noise filters
  metrics.ts    TTFR, cycle, lead time + percentiles
  report.ts     Table + markdown
  insights.ts   Aggregate process hints
  types.ts      Shared types
```
