/**
 * Verification for module blueprint allocation, run outside Next:
 *   npx tsx scripts/verify-blueprint.mts
 *
 * These are pure functions over the published quotas, so no database is needed.
 * What they pin down is that a mock module is the shape of a real form: the
 * right number of every skill, the right difficulty profile, and enough
 * variation between runs that two modules are not the same paper.
 */
import {
  MODULE_BLUEPRINTS,
  allocateSkills,
  blueprintSlots,
  blueprintFor,
  splitByMix,
  type ModuleBlueprint,
} from "@/lib/qbank/blueprint";
import type { Difficulty } from "@/lib/qbank/types";

const RUNS = 1000;

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected}\n        actual:   ${actual}`);
}

/** The skill sequence a Reading and Writing module should present. */
const RW_SEQUENCE = [
  "Words in Context",
  "Text Structure and Purpose",
  "Cross-Text Connections",
  "Central Ideas and Details",
  "Command of Evidence",
  "Inferences",
  "Boundaries",
  "Form, Structure, and Sense",
  "Transitions",
  "Rhetorical Synthesis",
];

for (const bp of MODULE_BLUEPRINTS) {
  console.log(`\n${bp.label}`);

  const runs = Array.from({ length: RUNS }, () => allocateSkills(bp));

  // ---------------------------------------------------------------- totals
  const totals = new Set(runs.map((r) => r.reduce((n, q) => n + q.count, 0)));
  check("every run is the module's length", [...totals].join(","), String(bp.questions));

  // ------------------------------------------------------------ each range
  let outOfRange = 0;
  let domainOutOfRange = 0;
  for (const run of runs) {
    for (const d of bp.domains) {
      const mine = run.filter((q) => q.domain === d.code);
      const total = mine.reduce((n, q) => n + q.count, 0);
      if (total < d.min || total > d.max) domainOutOfRange++;
      for (const s of d.skills ?? []) {
        const got = mine.find((q) => q.skill === s.name)?.count ?? -1;
        if (got < s.min || got > s.max) outOfRange++;
      }
    }
  }
  check("every domain lands inside its published range", domainOutOfRange, 0);
  check("every skill lands inside its published range", outOfRange, 0);

  // -------------------------------------------------------------- variation
  const shapes = new Set(runs.map((r) => r.map((q) => `${q.skill ?? q.domain}:${q.count}`).join()));
  check("runs are not all the same shape", shapes.size > 1, true);

  // ------------------------------------------------------------- difficulty
  const wanted = splitByMix(bp.questions, bp.mix);
  const slotRuns = Array.from({ length: RUNS }, () => blueprintSlots(bp));

  let wrongProfile = 0;
  for (const slots of slotRuns) {
    if (slots.length !== bp.questions) wrongProfile++;
    for (const d of ["E", "M", "H"] as Difficulty[]) {
      if (slots.filter((s) => s.difficulty === d).length !== wanted[d]) wrongProfile++;
    }
  }
  check("every run has the blueprint's exact difficulty profile", wrongProfile, 0);

  // A skill with a quota of one must not be pinned to one difficulty forever,
  // which is what a per-skill difficulty split would have done to it.
  const single = bp.domains.flatMap((d) => d.skills ?? []).filter((s) => s.max === 1);
  for (const s of single) {
    const seen = new Set(
      slotRuns.flatMap((slots) =>
        slots.filter((slot) => slot.skill === s.name).map((slot) => slot.difficulty),
      ),
    );
    const possible = (["E", "M", "H"] as Difficulty[]).filter((d) => wanted[d] > 0).length;
    check(`"${s.name}" is not pinned to one difficulty`, seen.size > 1, possible > 1);
  }
}

// ------------------------------------------------------------------ ordering
console.log("\nReading and Writing presents its skills in the section's order");
const rw = blueprintFor("rw", 1);
const declared = rw.order.flatMap(
  (code) => rw.domains.find((d) => d.code === code)?.skills?.map((s) => s.name) ?? [],
);
check("blueprint order matches the real section", declared.join(" · "), RW_SEQUENCE.join(" · "));

// --------------------------------------------------------------------- math
console.log("\nMath still allocates by domain alone");
const math: ModuleBlueprint = blueprintFor("math", 2);
const mathRun = allocateSkills(math);
check("one quota per domain", mathRun.length, math.domains.length);
check("none of them names a skill", mathRun.every((q) => q.skill === null), true);
check(
  "and they still add up",
  mathRun.reduce((n, q) => n + q.count, 0),
  math.questions,
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
