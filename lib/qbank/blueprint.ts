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

export interface SkillQuota {
  /** `skill_name` on the questions table, in the bank's canonical spelling. */
  name: string;
  min: number;
  max: number;
}

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
  /**
   * What the domain's questions are made of, in the order the real module
   * presents them. A domain without this is allocated as a whole, which is how
   * Math still works — its per-skill counts are not written down yet.
   */
  skills?: SkillQuota[];
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

/**
 * Reading and Writing, to the published shares of the section: Craft and
 * Structure 28%, Information and Ideas 26%, Standard English Conventions 26%,
 * Expression of Ideas 20%. Against 27 scored questions those come to 8/7/7/5,
 * which is why every domain here lands on its maximum — the variation in a form
 * is which *skills* inside a domain get the questions, not how many the domain
 * gets.
 *
 * Skill names must match `skill_name` in the bank exactly; they are the only
 * identifier it gives a skill.
 */
const RW_DOMAINS: DomainQuota[] = [
  {
    code: "CAS",
    name: "Craft and Structure",
    min: 7,
    max: 8,
    skills: [
      { name: "Words in Context", min: 5, max: 6 },
      { name: "Text Structure and Purpose", min: 1, max: 2 },
      { name: "Cross-Text Connections", min: 1, max: 1 },
    ],
  },
  {
    code: "INI",
    name: "Information and Ideas",
    min: 6,
    max: 7,
    skills: [
      { name: "Central Ideas and Details", min: 2, max: 3 },
      { name: "Command of Evidence", min: 3, max: 4 },
      { name: "Inferences", min: 1, max: 2 },
    ],
  },
  {
    code: "SEC",
    name: "Standard English Conventions",
    min: 6,
    max: 7,
    skills: [
      { name: "Boundaries", min: 2, max: 3 },
      { name: "Form, Structure, and Sense", min: 4, max: 4 },
    ],
  },
  {
    code: "EOI",
    name: "Expression of Ideas",
    min: 4,
    max: 5,
    skills: [
      { name: "Transitions", min: 2, max: 3 },
      { name: "Rhetorical Synthesis", min: 2, max: 3 },
    ],
  },
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

interface Range {
  key: string;
  min: number;
  max: number;
}

/**
 * Spends `total` questions across a set of published ranges.
 *
 * Everything starts at its minimum; the questions left over are handed out one
 * at a time in random order among the entries with headroom, so the totals land
 * inside the ranges College Board documents and two runs of the same module are
 * not the same shape.
 */
function spread(total: number, ranges: Range[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ranges) out[r.key] = r.min;

  let left = total - ranges.reduce((n, r) => n + r.min, 0);

  const headroom = shuffled(
    ranges.flatMap((r) => Array.from({ length: Math.max(0, r.max - r.min) }, () => r.key)),
  );
  for (const key of headroom) {
    if (left <= 0) break;
    out[key]++;
    left--;
  }

  // The rest is only reachable when a blueprint's own numbers do not add up to
  // its question count. Shipping a module of the wrong length would be worse
  // than pushing one quota outside its range, so the remainder is forced.
  const keys = ranges.map((r) => r.key);
  for (let i = 0; left > 0 && keys.length; i++, left--) out[keys[i % keys.length]]++;
  while (left < 0) {
    const biggest = keys.slice().sort((a, b) => out[b] - out[a])[0];
    out[biggest]--;
    left++;
  }

  return out;
}

/** How many questions each content domain gets on this run. */
export function allocateDomains(bp: ModuleBlueprint): Record<string, number> {
  return spread(
    bp.questions,
    bp.domains.map((d) => ({ key: d.code, min: d.min, max: d.max })),
  );
}

/** A quota for one run: how many questions of one skill (or whole domain). */
export interface QuotaAllocation {
  /** `domain_code`. */
  domain: string;
  /** `skill_name`, or null for a domain allocated as a whole. */
  skill: string | null;
  count: number;
}

/**
 * The run's quotas, in presentation order.
 *
 * Two passes: the domains split the module between them, then each domain
 * splits its own share across its skills. Going through the domain first is
 * what keeps a run of good luck on Words in Context from pushing Craft and
 * Structure past its share of the section.
 */
export function allocateSkills(bp: ModuleBlueprint): QuotaAllocation[] {
  const perDomain = allocateDomains(bp);

  return bp.domains.flatMap((d): QuotaAllocation[] => {
    if (!d.skills?.length) return [{ domain: d.code, skill: null, count: perDomain[d.code] }];
    const perSkill = spread(
      perDomain[d.code],
      d.skills.map((s) => ({ key: s.name, min: s.min, max: s.max })),
    );
    return d.skills.map((s) => ({ domain: d.code, skill: s.name, count: perSkill[s.name] }));
  });
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

export interface BlueprintSlot {
  domain: string;
  /** `skill_name`, or null where the blueprint only fixes the domain. */
  skill: string | null;
  difficulty: Difficulty;
}

/**
 * Every slot the blueprint asks for, in no order.
 *
 * The difficulty mix is dealt across the module as a whole rather than applied
 * to each quota. A skill that only gets one question — Cross-Text Connections —
 * would otherwise land on whichever difficulty the largest remainder happened to
 * favour, in every module ever generated. Dealing from one shuffled pile keeps
 * the module's overall E/M/H profile exact while leaving any given skill free to
 * come up at any level.
 */
export function blueprintSlots(bp: ModuleBlueprint): BlueprintSlot[] {
  const seats = allocateSkills(bp).flatMap((q) =>
    Array.from({ length: q.count }, () => ({ domain: q.domain, skill: q.skill })),
  );

  const split = splitByMix(seats.length, bp.mix);
  const levels = shuffled(
    DIFFICULTIES.flatMap((d) => Array.from({ length: split[d] }, () => d)),
  );

  return seats.map((seat, i) => ({ ...seat, difficulty: levels[i] }));
}
