/**
 * Fetches every non-live question body in the bank and caches it.
 *
 * Without this, gradability is only discovered when a drill happens to pick an
 * item, so the per-skill counts the app advertises overstate what it can
 * actually serve — the disclosed-item pool ships ~18% of its questions with no
 * answer key. Running this makes those counts truthful up front.
 *
 *   npx tsx --env-file=.env scripts/backfill.ts
 *
 * Resumable: already-cached questions are skipped, so a re-run after a failure
 * only fetches what is missing. Pass --refetch to re-download everything.
 */
import { all, ready } from "@/lib/db/index";
import { syncCatalog } from "@/lib/db/sync";
import { loadDetails, type QuestionRef } from "@/lib/questions";

/** Questions per round. Each round is one cache read, N fetches, one write. */
const BATCH = 100;

async function main() {
  const refetch = process.argv.includes("--refetch");

  await ready();
  console.log("Syncing catalog...");
  const { counts } = await syncCatalog(true);
  console.log("  ", counts);

  const refs = await all<QuestionRef>(
    `SELECT DISTINCT q.key, q.source, q.external_id, q.ibn
     FROM questions q
     WHERE q.is_live = false
     ${refetch ? "" : "AND NOT EXISTS (SELECT 1 FROM question_details d WHERE d.key = q.key)"}
     ORDER BY q.key`,
  );

  console.log(`\n${refs.length} question(s) to fetch.`);

  let ok = 0;
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = refs.slice(i, i + BATCH);
    const details = await loadDetails(batch);
    ok += batch.filter((r) => details.has(r.key)).length;
    console.log(`  ${Math.min(i + BATCH, refs.length)}/${refs.length} (${ok} cached)`);
  }

  const failed = refs.length - ok;
  if (failed > 0) console.warn(`\n${failed} question(s) could not be fetched — re-run to retry.`);

  const summary = await all<{
    assessment_id: number;
    module: string;
    source: string;
    listed: number;
    usable: number;
  }>(
    `SELECT q.assessment_id, q.module, q.source,
            COUNT(*)::int AS listed,
            COUNT(*) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM question_details d WHERE d.key = q.key AND d.gradable = false
              )
            )::int AS usable
     FROM questions q
     WHERE q.is_live = false
     GROUP BY 1, 2, 3
     ORDER BY 1, 2, 3`,
  );

  console.log("\nNon-live pool (listed = matches the educator bank, usable = has an answer key):");
  console.table(summary);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
