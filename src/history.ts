import { readFile, writeFile } from "node:fs/promises";
import type { MetricsHistory, MetricsSnapshot } from "./types.js";

export function historyPathForReport(outPath: string): string {
  if (outPath.toLowerCase().endsWith(".md")) {
    return `${outPath.slice(0, -3)}.history.json`;
  }
  return `${outPath}.history.json`;
}

export async function loadHistory(historyPath: string): Promise<MetricsHistory | null> {
  try {
    const raw = await readFile(historyPath, "utf8");
    const parsed = JSON.parse(raw) as MetricsHistory;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function appendHistoryEntry(
  existing: MetricsHistory | null,
  snapshot: MetricsSnapshot,
  historyLimit: number,
): MetricsHistory {
  const base: MetricsHistory =
    existing &&
    existing.workspace === snapshot.workspace &&
    existing.repoSlug === snapshot.repoSlug
      ? existing
      : {
          workspace: snapshot.workspace,
          repoSlug: snapshot.repoSlug,
          entries: [],
        };

  const entries = [...base.entries, snapshot].slice(-historyLimit);
  return {
    workspace: snapshot.workspace,
    repoSlug: snapshot.repoSlug,
    entries,
  };
}

export async function writeHistory(
  history: MetricsHistory,
  historyPath: string,
): Promise<void> {
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

/** Prefer the last history entry that is not identical to the just-written snapshot. */
export function previousFromHistory(
  history: MetricsHistory | null,
  current: MetricsSnapshot,
): MetricsSnapshot | null {
  if (!history || history.entries.length === 0) return null;
  const last = history.entries[history.entries.length - 1];
  if (last.integritySha256 === current.integritySha256 && last.generatedAt === current.generatedAt) {
    return history.entries.length >= 2 ? history.entries[history.entries.length - 2] : null;
  }
  return last;
}
