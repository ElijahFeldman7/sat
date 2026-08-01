/**
 * HTTP client for the College Board question bank.
 *
 * Ported from ../projects/collegeboard-qbank-api/main.py — same endpoints, same
 * retry semantics (honor Retry-After on 429, max 3 retries, concurrency capped
 * at 10 like `afetchmany`).
 */
import type {
  Catalog,
  Domain,
  ModuleKey,
  QuestionSummary,
  RawDetailedQuestion,
  RawLegacyItem,
} from "./types";
import { MODULES } from "./types";

const BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank";

export const LOOKUP_URL = `${BASE}/lookup`;
export const QUESTIONS_URL = `${BASE}/digital/get-questions`;
export const QUESTION_URL = `${BASE}/digital/get-question`;
export const LEGACY_URL = "https://saic.collegeboard.org/disclosed";

export class QBankError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QBankError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  maxRetries?: number;
  timeoutMs?: number;
}

async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, maxRetries = 3, timeoutMs = 20_000 } = opts;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 60;
        if (attempt >= maxRetries) {
          throw new QBankError(`QBank rate limited after ${maxRetries} retries`, 429);
        }
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new QBankError(
          `QBank API error [${res.status}]: ${detail.slice(0, 200) || "no body"}`,
          res.status,
        );
      }

      return (await res.json()) as T;
    } catch (err) {
      // A 4xx/5xx that isn't 429 is still worth one or two retries — the bank is
      // flaky under load — but give up once we've exhausted the budget.
      if (attempt >= maxRetries) {
        if (err instanceof QBankError) throw err;
        throw new QBankError(`QBank network error: ${(err as Error).message}`);
      }
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

interface RawLookup {
  lookupData: {
    assessment: { id: string; text: string }[];
    test: { id: string; text: string }[];
    domain: Record<
      string,
      {
        id: string;
        text: string;
        primaryClassCd: string;
        skill: { id: string; text: string }[];
      }[]
    >;
  };
  mathLiveItems: string[];
  readingLiveItems: string[];
}

/**
 * Domains/skills plus the set of *live* (currently-in-use) item ids.
 * Every question those sets name must be excluded from drills.
 */
export async function fetchCatalog(): Promise<Catalog> {
  const raw = await request<RawLookup>(LOOKUP_URL);

  const domainsFor = (module: ModuleKey): Domain[] =>
    (raw.lookupData.domain[MODULES[module].lookupKey] ?? []).map((d) => ({
      id: Number(d.id),
      name: d.text,
      code: d.primaryClassCd,
      skills: d.skill.map((s) => ({ id: Number(s.id), name: s.text })),
    }));

  return {
    domains: { math: domainsFor("math"), rw: domainsFor("rw") },
    liveItems: {
      math: new Set(raw.mathLiveItems.map((id) => id.toLowerCase())),
      rw: new Set(raw.readingLiveItems.map((id) => id.toLowerCase())),
    },
  };
}

export async function fetchQuestionList(
  assessmentId: number,
  module: ModuleKey,
  domainCodes: string[],
): Promise<QuestionSummary[]> {
  return request<QuestionSummary[]>(QUESTIONS_URL, {
    method: "POST",
    body: {
      asmtEventId: assessmentId,
      test: MODULES[module].testId,
      domain: domainCodes.join(","),
    },
    timeoutMs: 45_000,
  });
}

export async function fetchQuestion(externalId: string): Promise<RawDetailedQuestion> {
  return request<RawDetailedQuestion>(QUESTION_URL, {
    method: "POST",
    body: { external_id: externalId },
  });
}

/** Legacy disclosed item, keyed by IBN. Returns an array of one item. */
export async function fetchLegacyItem(ibn: string): Promise<RawLegacyItem> {
  const items = await request<RawLegacyItem[]>(`${LEGACY_URL}/${ibn}.json`);
  if (!items?.length) throw new QBankError(`No disclosed item for IBN ${ibn}`);
  return items[0];
}

/** Runs `worker` over `items` with at most `concurrency` in flight. */
export async function mapConcurrent<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 10,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(runners);
  return results;
}
