/**
 * End-to-end verification of the data layer, run outside Next:
 *   npx tsx scripts/verify.ts
 *
 * The headline assertion is the live-item guard: no question the app can serve
 * may be one that is currently in use on a real exam.
 */
import { all, close, get } from "@/lib/db/index";
import { syncCatalog } from "@/lib/db/sync";
import {
  countAvailable,
  getDrillQuestions,
  listCandidates,
  pickBalanced,
  upsertUser,
} from "@/lib/db/queries";
import { loadDetails } from "@/lib/questions";
import { gradeAnswer, gradeSpr, parseNumeric } from "@/lib/qbank/grade";
import { isGradable } from "@/lib/qbank/normalize";
import { createDrill } from "@/lib/drills";
import { ASSESSMENTS, type ModuleKey } from "@/lib/qbank/types";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  section("1. Catalog sync");
  const t0 = Date.now();
  const { counts } = await syncCatalog(true);
  console.log(`  synced in ${((Date.now() - t0) / 1000).toFixed(1)}s`, counts);

  const totals = await all<{ module: string; assessment_id: number; live: string; n: string }>(
    `SELECT module, assessment_id, COUNT(*) FILTER (WHERE is_live) AS live, COUNT(*) AS n
     FROM questions GROUP BY assessment_id, module ORDER BY assessment_id, module`,
  );
  for (const row of totals) {
    const n = Number(row.n);
    const liveN = Number(row.live);
    console.log(
      `  ${row.assessment_id} ${row.module.padEnd(4)} total=${String(n).padStart(5)} live=${String(liveN).padStart(4)} usable=${n - liveN}`,
    );
  }
  check("live items were flagged", totals.every((r) => Number(r.live) > 0));
  check("usable pool remains", totals.every((r) => Number(r.n) - Number(r.live) > 50));

  section("2. Live-item guard");
  const live = Number(
    (await get<{ n: string }>("SELECT COUNT(*) AS n FROM questions WHERE is_live = true"))?.n ?? 0,
  );
  check("bank contains live items to exclude", live > 0, `${live} flagged`);

  for (const moduleKey of ["math", "rw"] as ModuleKey[]) {
    const candidates = await listCandidates(
      { assessmentId: 99, module: moduleKey, includeLegacy: true },
      5000,
    );
    const leaked = await all<{ key: string }>(
      `SELECT key FROM questions
       WHERE is_live = true AND assessment_id = 99 AND module = ? AND key = ANY(?)`,
      [moduleKey, candidates.map((c) => c.key)],
    );
    check(
      `${moduleKey}: no live item in ${candidates.length} candidates`,
      leaked.length === 0,
      leaked.length ? `leaked ${leaked[0].key}` : "",
    );
  }

  const legacyOnly = await countAvailable({ assessmentId: 99, module: "math", includeLegacy: true });
  const qbankOnly = await countAvailable({ assessmentId: 99, module: "math", includeLegacy: false });
  check("legacy toggle widens the math pool", legacyOnly > qbankOnly, `${qbankOnly} → ${legacyOnly}`);

  section("3. Selection");
  const skills = ["Linear functions", "Percentages"];
  const picked = pickBalanced(
    await listCandidates({
      assessmentId: 99,
      module: "math",
      skills,
      difficulties: ["M", "H"],
      includeLegacy: true,
    }),
    8,
  );
  check("picked the requested count", picked.length === 8, `got ${picked.length}`);
  check(
    "respected the difficulty filter",
    picked.every((p) => p.difficulty === "M" || p.difficulty === "H"),
  );
  check(
    "respected the topic filter",
    picked.every((p) => skills.includes(p.skill_name)),
  );
  check(
    "balanced across both topics",
    new Set(picked.map((p) => p.skill_name)).size === 2,
    picked.map((p) => p.skill_name[0]).join(""),
  );
  check("no duplicates", new Set(picked.map((p) => p.key)).size === picked.length);

  section("4. Question bodies (live fetch + cache)");
  const details = await loadDetails(picked);
  check("fetched every body", details.size === picked.length, `${details.size}/${picked.length}`);
  const bodies = [...details.values()];
  check("all have a stem", bodies.every((b) => b.stem.length > 0));
  check("all have a rationale", bodies.every((b) => b.rationale.length > 0));

  // Raw picks may include the odd answer-key-less legacy item; those are
  // filtered out during drill creation (section 7), not here.
  const gradableBodies = bodies.filter(isGradable);
  check(
    "gradable mcq items have options and a correct letter",
    gradableBodies
      .filter((b) => b.type === "mcq")
      .every((b) => b.options.length >= 2 && !!b.correctLetter),
  );
  check(
    "gradable spr items have accepted answers",
    gradableBodies.filter((b) => b.type === "spr").every((b) => b.correctKeys.length > 0),
  );
  console.log(`  ungradable in this sample: ${bodies.length - gradableBodies.length}`);
  console.log(
    `  types: ${bodies.filter((b) => b.type === "mcq").length} mcq, ${bodies.filter((b) => b.type === "spr").length} spr`,
  );

  // Count outbound calls rather than timing them: wall-clock comparisons are
  // meaningless once a previous run has already warmed the cache.
  const realFetch = globalThis.fetch;
  let qbankCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("collegeboard.org")) qbankCalls++;
    return realFetch(input, init);
  }) as typeof fetch;

  const second = await loadDetails(picked);
  globalThis.fetch = realFetch;

  check("second load hit the cache, no question bank calls", qbankCalls === 0, `${qbankCalls} calls`);
  check("cached load returned every question", second.size === picked.length);

  section("5. Legacy disclosed items");
  const legacy = (
    await listCandidates({ assessmentId: 99, module: "math", includeLegacy: true }, 5000)
  ).filter((c) => c.source === "legacy");
  check("legacy items exist in the pool", legacy.length > 0, `${legacy.length}`);
  if (legacy.length) {
    const legacyDetails = await loadDetails(legacy.slice(0, 3));
    const ok = [...legacyDetails.values()];
    check("legacy bodies normalize", ok.length === 3 && ok.every((b) => b.stem.length > 0));
    check("legacy answers resolve", ok.every((b) => b.correctKeys.length > 0));
  }

  section("6. Grading");
  check("mcq by option id", gradeAnswer("opt-2", mcq()) === true);
  check("mcq wrong option", gradeAnswer("opt-1", mcq()) === false);
  check("mcq unanswered", gradeAnswer(null, mcq()) === false);
  check("spr exact", gradeSpr("403", ["403"]));
  check("spr fraction key typed as a fraction", gradeSpr("3/17", [".1764", ".1765", "3/17"]));
  check("spr fraction key typed as a decimal", gradeSpr("0.1765", [".1764", ".1765", "3/17"]));
  check("spr extra precision truncates to a key", gradeSpr("0.17647", [".1764", ".1765", "3/17"]));
  check("spr equivalent fraction", gradeSpr("16.25", ["65/4"]));
  check("spr formatting noise ignored", gradeSpr(" $1,200 ", ["1200"]));
  check("spr unicode minus", gradeSpr("−5", ["-5"]));
  check("spr rejects a wrong value", gradeSpr("404", ["403"]) === false);
  check("spr rejects empty", gradeSpr("", ["403"]) === false);
  check("parseNumeric handles mixed forms", parseNumeric("-3/17")! < 0 && parseNumeric("abc") === null);

  section("7. Drill creation end-to-end");
  await upsertUser({ id: "verify-user", email: "verify@example.test", name: "Verify" });

  const drill = await createDrill("verify-user", {
    assessmentId: 99,
    module: "math",
    skills,
    difficulties: ["M", "H"],
    count: 10,
    timingMode: "per-question",
    secondsPerQuestion: 75,
    includeLegacy: true,
    excludeSeen: true,
  });
  check("created a full set", drill.count === 10, `${drill.count}/${drill.requested}`);

  const rows = await getDrillQuestions(drill.id, "verify-user");
  check("rows join back to the catalog", rows.every((r) => !!r.skill_name));

  const drillDetails = await loadDetails(rows);
  check(
    "every question in the drill is gradable",
    rows.every((r) => {
      const d = drillDetails.get(r.key);
      return d && isGradable(d);
    }),
  );

  const ungradable = Number(
    (await get<{ n: string }>("SELECT COUNT(*) AS n FROM question_details WHERE gradable = false"))
      ?.n ?? 0,
  );
  console.log(`  ungradable items seen so far: ${ungradable} (excluded from all future picks)`);
  const leakedUngradable = Number(
    (
      await get<{ n: string }>(
        `SELECT COUNT(*) AS n FROM drill_questions dq
         JOIN question_details qd ON qd.key = dq.question_key
         WHERE qd.gradable = false`,
      )
    )?.n ?? 0,
  );
  check("no ungradable question in any drill set", leakedUngradable === 0, `found ${leakedUngradable}`);

  const liveInSets = Number(
    (
      await get<{ n: string }>(
        `SELECT COUNT(*) AS n FROM drill_questions dq
         JOIN drill_sets ds ON ds.id = dq.set_id
         JOIN questions q ON q.key = dq.question_key
                         AND q.assessment_id = ds.assessment_id AND q.module = ds.module
         WHERE q.is_live = true`,
      )
    )?.n ?? 0,
  );
  check("NO live question in any drill set, ever", liveInSets === 0, `found ${liveInSets}`);

  // Leave no test data behind (drill_sets cascade from users).
  await all("DELETE FROM users WHERE id = 'verify-user'");

  section("8. Exam coverage");
  for (const a of ASSESSMENTS) {
    const math = await countAvailable({ assessmentId: a.id, module: "math", includeLegacy: true });
    const rw = await countAvailable({ assessmentId: a.id, module: "rw", includeLegacy: true });
    check(`${a.name} has a usable pool`, math > 100 && rw > 100, `math=${math} rw=${rw}`);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}\n`);
  await close();
  process.exit(failures === 0 ? 0 : 1);
}

function mcq() {
  return {
    key: "k",
    type: "mcq" as const,
    stem: "",
    stimulus: null,
    rationale: "",
    options: [
      { id: "opt-1", letter: "A", html: "" },
      { id: "opt-2", letter: "B", html: "" },
    ],
    correctKeys: ["opt-2"],
    correctLetter: "B",
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
