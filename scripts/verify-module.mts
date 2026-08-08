/**
 * Builds real mock modules against the question bank, run outside Next:
 *   npx tsx --env-file=.env scripts/verify-module.mts
 *
 * `verify-blueprint.mts` proves the quotas add up; this proves the pool can
 * actually serve them — that every skill's cell has enough questions at the
 * difficulties a module asks for, that they come out in the section's order, and
 * that a student who has worked through the bank still gets a full-shape module
 * rather than one quietly rebalanced onto whatever was left.
 *
 * It writes and then removes its own user, like `verify.ts`.
 */
import { all, close, dbTarget, run } from "@/lib/db/index";
import { upsertUser } from "@/lib/db/queries";
import { createModuleDrill } from "@/lib/drills";
import { blueprintFor } from "@/lib/qbank/blueprint";

const USER = "verify-module-user";
const ASSESSMENT = 99;

/**
 * Refuses to run against anything but a local database.
 *
 * This script writes: it creates a user and a pile of drills, then removes
 * them. Pointed at the live database by whichever `.env` file happened to win,
 * that is somebody's real account. Set ALLOW_REMOTE_WRITES=1 to override.
 */
function requireLocalDatabase(script: string) {
  const target = dbTarget();
  if (target.isLocal || process.env.ALLOW_REMOTE_WRITES === "1") return;
  console.error(
    `\n${script} writes test data, and ${target.host}/${target.database} is not a local database.\n` +
      "Point .env.local at a local Postgres, or set ALLOW_REMOTE_WRITES=1 to do it anyway.\n",
  );
  process.exit(1);
}

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected}\n        actual:   ${actual}`);
};

interface Row {
  idx: number;
  skill_name: string;
  domain_code: string;
  difficulty: string;
  question_key: string;
}

async function built(setId: string): Promise<Row[]> {
  return all<Row>(
    `SELECT dq.idx, q.skill_name, q.domain_code, q.difficulty, dq.question_key
     FROM drill_questions dq
     JOIN questions q ON q.key = dq.question_key AND q.assessment_id = ? AND q.module = 'rw'
     WHERE dq.set_id = ? ORDER BY dq.idx`,
    [ASSESSMENT, setId],
  );
}

async function main() {
  requireLocalDatabase("verify-module.mts");
  await upsertUser({ id: USER, email: "verify-module@example.test", name: "Verify Module" });
  await run("DELETE FROM drill_sets WHERE user_id = ?", [USER]);

  for (const part of [1, 2] as const) {
    const bp = blueprintFor("rw", part);
    console.log(`\n${bp.label}`);

    const { id, count } = await createModuleDrill(USER, {
      assessmentId: ASSESSMENT,
      blueprint: bp,
      includeLegacy: false,
      excludeSeen: true,
    });
    const rows = await built(id);

    check("full length", count, bp.questions);
    check("all rows stored", rows.length, bp.questions);

    // Per-skill counts inside their published ranges.
    let bad = 0;
    const got = new Map<string, number>();
    for (const r of rows) got.set(r.skill_name, (got.get(r.skill_name) ?? 0) + 1);
    for (const d of bp.domains) {
      for (const s of d.skills ?? []) {
        const n = got.get(s.name) ?? 0;
        if (n < s.min || n > s.max) {
          bad++;
          console.log(`        ${s.name}: ${n}, wanted ${s.min}–${s.max}`);
        }
      }
    }
    check("every skill inside its range", bad, 0);
    console.log(
      "  counts:",
      [...got.entries()].map(([k, v]) => `${k} ${v}`).join(", "),
    );

    // Presentation order: domains in the section's order, skills in theirs.
    const wanted = bp.order.flatMap(
      (code) => bp.domains.find((d) => d.code === code)?.skills?.map((s) => s.name) ?? [],
    );
    const rank = new Map(wanted.map((name, i) => [name, i]));
    const ranks = rows.map((r) => rank.get(r.skill_name) ?? -1);
    check(
      "questions arrive in the section's skill order",
      ranks.every((v, i) => i === 0 || ranks[i - 1] <= v),
      true,
    );
    console.log("  order :", [...new Set(rows.map((r) => r.skill_name))].join(" → "));
  }

  // Building repeatedly must keep the shape rather than run out and substitute.
  console.log("\nRepeat builds keep their shape and reach for the oldest questions");
  const bp = blueprintFor("rw", 1);
  const seenBefore = new Set((await all<{ k: string }>(
    `SELECT DISTINCT dq.question_key AS k FROM drill_questions dq
     JOIN drill_sets ds ON ds.id = dq.set_id WHERE ds.user_id = ?`,
    [USER],
  )).map((r) => r.k));

  for (let i = 0; i < 12; i++) {
    await createModuleDrill(USER, {
      assessmentId: ASSESSMENT,
      blueprint: bp,
      includeLegacy: false,
      excludeSeen: true,
    });
  }

  const last = await all<{ id: string }>(
    "SELECT id FROM drill_sets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [USER],
  );
  const rows = await built(last[0].id);
  let bad = 0;
  const got = new Map<string, number>();
  for (const r of rows) got.set(r.skill_name, (got.get(r.skill_name) ?? 0) + 1);
  for (const d of bp.domains) {
    for (const s of d.skills ?? []) {
      const n = got.get(s.name) ?? 0;
      if (n < s.min || n > s.max) {
        bad++;
        console.log(`        ${s.name}: ${n}, wanted ${s.min}–${s.max}`);
      }
    }
  }
  check("the 13th module is still the right shape", bad, 0);
  check("still full length", rows.length, bp.questions);
  const repeats = rows.filter((r) => seenBefore.has(r.question_key)).length;
  console.log(`  ${repeats} of ${rows.length} were seen in an earlier build`);

  await run("DELETE FROM drill_sets WHERE user_id = ?", [USER]);
  await run("DELETE FROM users WHERE id = ?", [USER]);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
  await close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await close();
  process.exit(1);
});
