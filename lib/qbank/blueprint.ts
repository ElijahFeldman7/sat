import type { Difficulty, ModuleKey } from "./types";

/**
 * Test-form blueprints for a single adaptive module.
 *
 * The digital SAT is two modules per section. Module 1 is a fixed, mixed-ability
 * form; Module 2 is routed by how Module 1 went, and the upper tier is where the
 * hard items live. A drill assembled to one of these blueprints is the same
 * shape as the thing it is practising for: same question count, same clock, same
 * split across content domains, same order on screen.
 *
 * Question counts here are the *scored* form. The real test hides two unscored
 * pretest items in each module; there is nothing to gain from making a student
 * answer questions we then throw away, so they are left out.
 */

export type ModulePart = 1 | 2;

export interface DomainQuota {
  /** `domain_code` on the questions table — 'INI', 'CAS', 'H', 'P', … */
  code: string;
  /** Human name, for the summary line in the picker. */
  name: string;
  /**
   * College Board publishes a range rather than a fixed count, and real forms
   * move inside it. So does this: the quota is drawn from the range each time,
   * which keeps two runs of the same module from being the same shape.
   */
  min: number;
  max: number;
}

export interface ModuleBlueprint {
  id: string;
  module: ModuleKey;
  part: ModulePart;
  /** "Reading and Writing · Module 2" */
  label: string;
  /** Banner text inside the exam. */
  banner: string;
  /** One line describing what makes this module what it is. */
  blurb: string;
  questions: number;
  seconds: number;
  domains: DomainQuota[];
  /** Relative weight per difficulty; normalised when allocating. */
  mix: Record<Difficulty, number>;
  /** Share of the module that is student-produced response (math only). */
  sprShare: number;
  /** Domain codes in the order the real module presents them. */
  order: string[];
}

const RW_DOMAINS: DomainQuota[] = [
  { code: "INI", name: "Information and Ideas", min: 7, max: 8 },
  { code: "CAS", name: "Craft and Structure", min: 7, max: 8 },
  { code: "EOI", name: "Expression of Ideas", min: 5, max: 6 },
  { code: "SEC", name: "Standard English Conventions", min: 5, max: 6 },
];

const MATH_DOMAINS: DomainQuota[] = [
  { code: "H", name: "Algebra", min: 6, max: 8 },
  { code: "P", name: "Advanced Math", min: 6, max: 8 },
  { code: "Q", name: "Problem-Solving and Data Analysis", min: 3, max: 4 },
  { code: "S", name: "Geometry and Trigonometry", min: 3, max: 4 },
];

/** Reading and Writing runs its domains in this order, every form. */
const RW_ORDER = ["CAS", "INI", "SEC", "EOI"];
/** Math mixes domains and climbs in difficulty instead. */
const MATH_ORDER = ["H", "P", "Q", "S"];

/** Module 1 is the routing module: the full ability range, centre-weighted. */
const STANDARD_MIX: Record<Difficulty, number> = { E: 0.32, M: 0.42, H: 0.26 };
/**
 * The upper-tier Module 2 drops essentially every easy prompt and stacks
 * medium-hard and hard items — the tier where the trick distractors live.
 */
const HARD_MIX: Record<Difficulty, number> = { E: 0, M: 0.35, H: 0.65 };

export const MODULE_BLUEPRINTS: ModuleBlueprint[] = [
  {
    id: "rw-1",
    module: "rw",
    part: 1,
    label: "Reading and Writing · Module 1",
    banner: "Reading and Writing — Module 1",
    blurb: "Full ability range, as the routing module is built.",
    questions: 27,
    seconds: 32 * 60,
    domains: RW_DOMAINS,
    mix: STANDARD_MIX,
    sprShare: 0,
    order: RW_ORDER,
  },
  {
    id: "rw-2",
    module: "rw",
    part: 2,
    label: "Reading and Writing · Module 2",
    banner: "Reading and Writing — Module 2 (Hard)",
    blurb: "Upper adaptive tier: almost no easy prompts, hard-weighted.",
    questions: 27,
    seconds: 32 * 60,
    domains: RW_DOMAINS,
    mix: HARD_MIX,
    sprShare: 0,
    order: RW_ORDER,
  },
  {
    id: "math-1",
    module: "math",
    part: 1,
    label: "Math · Module 1",
    banner: "Math — Module 1",
    blurb: "Full ability range, as the routing module is built.",
    questions: 22,
    seconds: 35 * 60,
    domains: MATH_DOMAINS,
    mix: STANDARD_MIX,
    sprShare: 0.25,
    order: MATH_ORDER,
  },
  {
    id: "math-2",
    module: "math",
    part: 2,
    label: "Math · Module 2",
    banner: "Math — Module 2 (Hard)",
    blurb: "Upper adaptive tier: almost no easy prompts, hard-weighted.",
    questions: 22,
    seconds: 35 * 60,
    domains: MATH_DOMAINS,
    mix: HARD_MIX,
    sprShare: 0.25,
    order: MATH_ORDER,
  },
];

export function blueprintById(id: string | undefined | null): ModuleBlueprint | undefined {
  return id ? MODULE_BLUEPRINTS.find((b) => b.id === id) : undefined;
}

export function blueprintFor(module: ModuleKey, part: ModulePart): ModuleBlueprint {
  const found = MODULE_BLUEPRINTS.find((b) => b.module === module && b.part === part);
  if (!found) throw new Error(`No blueprint for ${module} module ${part}`);
  return found;
}

const DIFFICULTIES: Difficulty[] = ["E", "M", "H"];

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How many questions each content domain gets on this run.
 *
 * Every domain starts at its published minimum; the questions left over are
 * handed out one at a time in random order among the domains with headroom, so
 * the totals always land inside the ranges College Board documents.
 */
export function allocateDomains(bp: ModuleBlueprint): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of bp.domains) out[d.code] = d.min;

  let left = bp.questions - bp.domains.reduce((n, d) => n + d.min, 0);

  const headroom = shuffled(
    bp.domains.flatMap((d) => Array.from({ length: Math.max(0, d.max - d.min) }, () => d.code)),
  );
  for (const code of headroom) {
    if (left <= 0) break;
    out[code]++;
    left--;
  }

  // Only reachable if a blueprint's minimums overshoot its own question count;
  // trim the biggest domains rather than ship a module of the wrong length.
  while (left < 0) {
    const biggest = Object.keys(out).sort((a, b) => out[b] - out[a])[0];
    out[biggest]--;
    left++;
  }

  return out;
}

/** Splits `n` questions across difficulties by weight, largest remainder first. */
export function splitByMix(n: number, mix: Record<Difficulty, number>): Record<Difficulty, number> {
  const total = DIFFICULTIES.reduce((sum, d) => sum + mix[d], 0) || 1;
  const exact = DIFFICULTIES.map((d) => (n * mix[d]) / total);
  const counts = exact.map(Math.floor);

  let left = n - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, remainder: value - counts[i] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    counts[i]++;
    left--;
  }

  return { E: counts[0], M: counts[1], H: counts[2] };
}

/** Every (domain, difficulty) slot the blueprint asks for, in no order. */
export function blueprintSlots(bp: ModuleBlueprint): { domain: string; difficulty: Difficulty }[] {
  const perDomain = allocateDomains(bp);
  const slots: { domain: string; difficulty: Difficulty }[] = [];

  for (const domain of Object.keys(perDomain)) {
    const split = splitByMix(perDomain[domain], bp.mix);
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < split[difficulty]; i++) slots.push({ domain, difficulty });
    }
  }

  return slots;
}
