import { fetchCatalog, fetchQuestionList } from "@/lib/qbank/client";
import { ASSESSMENTS, type Catalog, type ModuleKey } from "@/lib/qbank/types";
import { all, boolArray, get, ready, run, sql, tsArray } from "./index";

const STALE_MS = 24 * 60 * 60 * 1000;

/** Rows per INSERT. One round trip per chunk instead of per row. */
const CHUNK = 1000;

let catalogCache: { value: Catalog; at: number } | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < STALE_MS) return catalogCache.value;
  const value = await fetchCatalog();
  catalogCache = { value, at: Date.now() };
  return value;
}

export async function lastSyncedAt(): Promise<Date | null> {
  const row = await get<{ synced_at: Date }>(
    "SELECT synced_at FROM sync_state WHERE scope = 'catalog'",
  );
  return row?.synced_at ?? null;
}

export async function isStale(): Promise<boolean> {
  const at = await lastSyncedAt();
  return !at || Date.now() - at.getTime() > STALE_MS;
}

interface QuestionRowInput {
  key: string;
  externalId: string | null;
  ibn: string | null;
  uid: string | null;
  questionId: string | null;
  domainCode: string;
  domainName: string;
  skillName: string;
  difficulty: string;
  scoreBand: number | null;
  isLive: boolean;
  source: string;
  createdDate: Date | null;
  updatedDate: Date | null;
}

/** Bulk upsert via UNNEST — one statement per chunk. */
async function upsertQuestions(
  assessmentId: number,
  module: ModuleKey,
  rows: QuestionRowInput[],
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sql()`
      INSERT INTO questions (
        key, assessment_id, module, external_id, ibn, uid, question_id,
        domain_code, domain_name, skill_name, difficulty, score_band,
        is_live, source, created_date, updated_date, synced_at
      )
      SELECT k, ${assessmentId}, ${module}, ext, ibn, uid, qid,
             dcode, dname, skill, diff, band, live::boolean, src,
             cdate::timestamptz, udate::timestamptz, now()
      FROM UNNEST(
        ${chunk.map((r) => r.key)}::text[],
        ${chunk.map((r) => r.externalId)}::text[],
        ${chunk.map((r) => r.ibn)}::text[],
        ${chunk.map((r) => r.uid)}::text[],
        ${chunk.map((r) => r.questionId)}::text[],
        ${chunk.map((r) => r.domainCode)}::text[],
        ${chunk.map((r) => r.domainName)}::text[],
        ${chunk.map((r) => r.skillName)}::text[],
        ${chunk.map((r) => r.difficulty)}::text[],
        ${chunk.map((r) => r.scoreBand)}::int[],
        ${boolArray(chunk.map((r) => r.isLive))}::text[],
        ${chunk.map((r) => r.source)}::text[],
        ${tsArray(chunk.map((r) => r.createdDate))}::text[],
        ${tsArray(chunk.map((r) => r.updatedDate))}::text[]
      ) AS t(k, ext, ibn, uid, qid, dcode, dname, skill, diff, band, live, src, cdate, udate)
      ON CONFLICT (assessment_id, module, key) DO UPDATE SET
        domain_code  = excluded.domain_code,
        domain_name  = excluded.domain_name,
        skill_name   = excluded.skill_name,
        difficulty   = excluded.difficulty,
        score_band   = excluded.score_band,
        is_live      = excluded.is_live,
        updated_date = excluded.updated_date,
        synced_at    = excluded.synced_at
    `;
  }
}

/**
 * Refreshes the local question catalog for every assessment × module.
 *
 * `is_live` is set from the lookup endpoint's mathLiveItems/readingLiveItems —
 * questions currently in use on real tests. Nothing in the app may ever serve
 * one; see `availableQuestions` in queries.ts for where that is enforced.
 */
export async function syncCatalog(
  force = false,
): Promise<{ synced: boolean; counts: Record<string, number> }> {
  await ready();

  if (!force && !(await isStale())) {
    const rows = await all<{ k: string; n: string }>(
      "SELECT assessment_id || ':' || module AS k, COUNT(*) AS n FROM questions GROUP BY 1",
    );
    return { synced: false, counts: Object.fromEntries(rows.map((r) => [r.k, Number(r.n)])) };
  }

  const catalog = await getCatalog();
  const counts: Record<string, number> = {};

  for (const assessment of ASSESSMENTS) {
    for (const moduleKey of ["math", "rw"] as ModuleKey[]) {
      const domains = catalog.domains[moduleKey];
      const summaries = await fetchQuestionList(
        assessment.id,
        moduleKey,
        domains.map((d) => d.code),
      );
      const live = catalog.liveItems[moduleKey];

      const rows: QuestionRowInput[] = [];
      const seen = new Set<string>();

      for (const q of summaries) {
        const externalId = q.external_id?.toLowerCase() ?? null;
        const ibn = q.ibn?.trim() || null;
        if (!externalId && !ibn) continue;

        const key = externalId ?? `ibn:${ibn}`;
        // A single INSERT can't resolve conflicts within its own value list.
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
          key,
          externalId,
          ibn,
          uid: q.uId ?? null,
          questionId: q.questionId ?? null,
          domainCode: q.primary_class_cd,
          domainName: q.primary_class_cd_desc,
          skillName: q.skill_desc,
          difficulty: q.difficulty,
          scoreBand: q.score_band_range_cd ?? null,
          isLive: !!externalId && live.has(externalId),
          source: externalId ? "qbank" : "legacy",
          createdDate: q.createDate ? new Date(q.createDate) : null,
          updatedDate: q.updateDate ? new Date(q.updateDate) : null,
        });
      }

      await upsertQuestions(assessment.id, moduleKey, rows);
      counts[`${assessment.id}:${moduleKey}`] = rows.length;
    }
  }

  await run(
    `INSERT INTO sync_state (scope, synced_at) VALUES ('catalog', now())
     ON CONFLICT (scope) DO UPDATE SET synced_at = excluded.synced_at`,
  );

  return { synced: true, counts };
}

/**
 * Confirmed-fresh timestamp for this process. Without it every page load spends
 * two database round trips re-asking a question whose answer changes once a day.
 */
let freshUntil = 0;

/** Syncs only if the catalog is empty or stale. */
export async function ensureCatalog(): Promise<void> {
  if (Date.now() < freshUntil) return;

  await ready();
  const row = await get<{ n: string; synced_at: Date | null }>(
    `SELECT (SELECT COUNT(*) FROM questions) AS n,
            (SELECT synced_at FROM sync_state WHERE scope = 'catalog') AS synced_at`,
  );

  const empty = Number(row?.n ?? 0) === 0;
  const stale = !row?.synced_at || Date.now() - row.synced_at.getTime() > STALE_MS;

  if (empty || stale) await syncCatalog(true);
  freshUntil = Date.now() + 5 * 60 * 1000;
}
