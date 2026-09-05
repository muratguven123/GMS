import axios, { type AxiosInstance, type AxiosError } from "axios";
import type {
  BitbucketActivityItem,
  BitbucketPaginated,
  BitbucketPullRequest,
} from "./types.js";

const API_BASE = "https://api.bitbucket.org/2.0";

export interface BitbucketClientOptions {
  token: string;
  /** When set, use HTTP Basic (App Password). Otherwise Bearer. */
  username?: string;
  workspace: string;
  repoSlug: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BitbucketClient {
  private readonly http: AxiosInstance;
  private readonly workspace: string;
  private readonly repoSlug: string;

  constructor(opts: BitbucketClientOptions) {
    this.workspace = opts.workspace;
    this.repoSlug = opts.repoSlug;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (opts.username) {
      const basic = Buffer.from(`${opts.username}:${opts.token}`, "utf8").toString(
        "base64",
      );
      headers.Authorization = `Basic ${basic}`;
    } else {
      headers.Authorization = `Bearer ${opts.token}`;
    }

    this.http = axios.create({
      baseURL: API_BASE,
      headers,
      timeout: 60_000,
      validateStatus: (s) => s < 500,
    });
  }

  private async getWithRetry<T>(url: string, params?: Record<string, string | number>): Promise<T> {
    const maxAttempts = 5;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        const res = await this.http.get<T>(url, { params });

        if (res.status === 429) {
          if (attempt >= maxAttempts) {
            throw new Error("Bitbucket API rate limit exceeded after retries.");
          }
          const retryAfter = Number(res.headers["retry-after"]);
          const waitMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Math.min(30_000, 1000 * 2 ** attempt);
          await sleep(waitMs);
          continue;
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Bitbucket API authentication/authorization failed (HTTP ${res.status}). Check credentials and repository access.`,
          );
        }

        if (res.status >= 400) {
          throw new Error(`Bitbucket API request failed (HTTP ${res.status}).`);
        }

        return res.data;
      } catch (err) {
        const ax = err as AxiosError;
        if (ax.response?.status === 429 && attempt < maxAttempts) {
          const retryAfter = Number(ax.response.headers["retry-after"]);
          const waitMs = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : Math.min(30_000, 1000 * 2 ** attempt);
          await sleep(waitMs);
          continue;
        }
        if (axios.isAxiosError(err) && !err.response && attempt < maxAttempts) {
          await sleep(Math.min(30_000, 1000 * 2 ** attempt));
          continue;
        }
        throw err;
      }
    }
  }

  /** Follow `next` links until exhausted or `maxItems` collected. */
  async paginate<T>(
    initialPath: string,
    params: Record<string, string | number>,
    maxItems: number,
  ): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined = initialPath;
    let query: Record<string, string | number> | undefined = params;

    while (url && items.length < maxItems) {
      const page: BitbucketPaginated<T> = await this.getWithRetry(url, query);
      for (const value of page.values ?? []) {
        items.push(value);
        if (items.length >= maxItems) break;
      }
      url = page.next;
      // `next` is absolute and already includes query params
      query = undefined;
    }

    return items;
  }

  async listMergedPullRequests(limit: number): Promise<BitbucketPullRequest[]> {
    const path = `/repositories/${encodeURIComponent(this.workspace)}/${encodeURIComponent(this.repoSlug)}/pullrequests`;
    return this.paginate<BitbucketPullRequest>(
      path,
      {
        state: "MERGED",
        pagelen: 50,
        sort: "-updated_on",
      },
      limit,
    );
  }

  async listPullRequestActivity(prId: number): Promise<BitbucketActivityItem[]> {
    const path = `/repositories/${encodeURIComponent(this.workspace)}/${encodeURIComponent(this.repoSlug)}/pullrequests/${prId}/activity`;
    // Activity can be long; collect all pages (cap high to avoid unbounded loops)
    return this.paginate<BitbucketActivityItem>(path, { pagelen: 50 }, 500);
  }
}

/** Run async work over items with a fixed concurrency pool. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
