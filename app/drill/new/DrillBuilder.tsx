"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ASSESSMENTS, DIFFICULTY_LABELS, MODULES } from "@/lib/qbank/types";
import type { Difficulty, ModuleKey } from "@/lib/qbank/types";
import { blueprintFor, type ModulePart } from "@/lib/qbank/blueprint";
import { Card } from "@/components/Card";
import { ChevronDown } from "@/components/exam/icons";
import { TimingModal, type TopicShare } from "./TimingModal";

interface TopicSkill {
  name: string;
  total: number;
  available: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  medianSeconds: number | null;
  medianByDifficulty: Partial<Record<Difficulty, number>>;
}

/**
 * The student's typical time on a topic, narrowed to the difficulties actually
 * being drilled — a Hard-only set should not be paced off an Easy-heavy median.
 * Falls back to the topic's overall median when there's no history at those
 * difficulties.
 */
function seedSeconds(skill: TopicSkill, difficulties: Set<Difficulty>): number | null {
  if (difficulties.size) {
    const known = [...difficulties]
      .map((d) => skill.medianByDifficulty[d])
      .filter((n): n is number => typeof n === "number");
    if (known.length) return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
  }
  return skill.medianSeconds;
}

/**
 * Mirrors `pickBalanced` on the server: questions are dealt round-robin across
 * the chosen topics, so with more topics than questions the later ones get
 * nothing. Only topics that actually receive a question are worth pacing.
 */
function shareOut(
  skills: TopicSkill[],
  count: number,
  difficulties: Set<Difficulty>,
): TopicShare[] {
  const got = new Map<string, number>();
  let round = 0;
  let placed = 0;
  while (placed < count) {
    let took = false;
    for (const s of skills) {
      if (round < s.available && placed < count) {
        got.set(s.name, (got.get(s.name) ?? 0) + 1);
        placed++;
        took = true;
      }
    }
    if (!took) break;
    round++;
  }
  return skills
    .filter((s) => got.has(s.name))
    .map((s) => ({
      name: s.name,
      questions: got.get(s.name)!,
      medianSeconds: seedSeconds(s, difficulties),
    }));
}

interface TopicDomain {
  code: string;
  name: string;
  skills: TopicSkill[];
}

const DIFFICULTIES: Difficulty[] = ["E", "M", "H"];

/**
 * Topic trees already fetched, keyed by query. Module and toggle switches are
 * the main thing you do on this page, and the database lives a round trip away,
 * so results are kept for the life of the page and neighbouring combinations
 * are prefetched.
 */
const cache = new Map<string, TopicDomain[]>();
const inFlight = new Map<string, Promise<{ domains: TopicDomain[]; error: string | null }>>();

/** "5–6", or just "4" where the blueprint fixes the count. */
const range = (q: { min: number; max: number }) => (q.min === q.max ? `${q.min}` : `${q.min}–${q.max}`);

function fetchTopics(key: string) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const [assessment, module, legacy, unseen] = key.split("|");
  const params = new URLSearchParams({ assessment, module, legacy, unseen });

  const promise = fetch(`/api/topics?${params}`)
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load topics");
      cache.set(key, data.domains as TopicDomain[]);
      return { domains: data.domains as TopicDomain[], error: null };
    })
    .catch((err: Error) => ({ domains: [] as TopicDomain[], error: err.message }))
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

export function DrillBuilder() {
  const router = useRouter();
  const [assessmentId, setAssessmentId] = useState<number>(ASSESSMENTS[0].id);
  const [module, setModule] = useState<ModuleKey>("math");
  const [loaded, setLoaded] = useState<{ key: string; domains: TopicDomain[] } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [difficulties, setDifficulties] = useState<Set<Difficulty>>(new Set());
  const [count, setCount] = useState(10);
  const [excludeSeen, setExcludeSeen] = useState(true);
  const [includeLegacy, setIncludeLegacy] = useState(true);

  const [timingOpen, setTimingOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** "custom" builds a drill from topics; "module" runs a mock test module. */
  const [mode, setMode] = useState<"custom" | "module">("custom");
  const [part, setPart] = useState<ModulePart>(2);
  const blueprint = blueprintFor(module, part);

  // The query is fully described by these four inputs, so the fetch key doubles
  // as the loading signal — no separate `loading` state to keep in sync.
  const queryKey = `${assessmentId}|${module}|${includeLegacy ? 1 : 0}|${excludeSeen ? 1 : 0}`;

  const cached = cache.get(queryKey);
  const loading = !cached && loaded?.key !== queryKey;
  const domains = useMemo(
    () => cached ?? loaded?.domains ?? [],
    [cached, loaded],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fresh = await fetchTopics(queryKey);
      if (cancelled) return;
      if (fresh.error) setError(fresh.error);
      else {
        setError(null);
        setLoaded({ key: queryKey, domains: fresh.domains });
      }
    })();

    // Warm the other module and the opposite "unseen" setting, so flipping
    // either is instant instead of another round trip to the database.
    const [a, m, l, u] = queryKey.split("|");
    for (const neighbour of [
      `${a}|${m === "math" ? "rw" : "math"}|${l}|${u}`,
      `${a}|${m}|${l}|${u === "1" ? "0" : "1"}`,
    ]) {
      if (!cache.has(neighbour)) void fetchTopics(neighbour);
    }

    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  const allSkills = useMemo(() => domains.flatMap((d) => d.skills), [domains]);

  const pool = useMemo(
    () => (selected.size ? allSkills.filter((s) => selected.has(s.name)) : allSkills),
    [allSkills, selected],
  );

  // Difficulty filtering happens server-side; this is the upper bound.
  const availableForSelection = useMemo(
    () => pool.reduce((n, s) => n + s.available, 0),
    [pool],
  );

  /**
   * Per-topic pacing is only offered for an explicit selection. With "All
   * topics" the list is every skill in the module, which is a wall of sliders
   * for no benefit — that case gets the single total control instead.
   */
  const topicShares = useMemo(
    () => (selected.size ? shareOut(pool, count, difficulties) : []),
    [count, difficulties, pool, selected.size],
  );

  // Skill names are module-scoped, so a module/exam switch invalidates them.
  function changeAssessment(id: number) {
    setAssessmentId(id);
    setSelected(new Set());
  }

  function changeModule(m: ModuleKey) {
    setModule(m);
    setSelected(new Set());
  }

  function toggleSkill(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleDomain(domain: TopicDomain) {
    const names = domain.skills.map((s) => s.name);
    const allOn = names.every((n) => selected.has(n));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of names) {
        if (allOn) next.delete(n);
        else next.add(n);
      }
      return next;
    });
  }

  async function create(timing: {
    timingMode: "per-question" | "total" | "untimed";
    secondsPerQuestion?: number;
    totalSeconds?: number;
    secondsPerSkill?: Record<string, number>;
  }) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessment: assessmentId,
          module,
          skills: [...selected],
          difficulties: [...difficulties],
          count,
          includeLegacy,
          excludeSeen,
          ...timing,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create drill");
      router.push(`/session/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
      setTimingOpen(false);
    }
  }

  /** A module carries its own count and clock, so there is nothing to ask. */
  async function startModule() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/drills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "module",
          assessment: assessmentId,
          module,
          part,
          includeLegacy,
          excludeSeen,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build the module");
      router.push(`/session/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1000px] px-[20px] py-[24px] md:px-[40px] md:py-[34px]">
      <h1 className="text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink md:text-[32px]">
        Build a drill
      </h1>

      {/* Exam + module */}
      <div className="mt-[22px] flex flex-wrap items-center gap-[10px]">
        <select
          value={assessmentId}
          onChange={(e) => changeAssessment(Number(e.target.value))}
          className="h-[38px] w-full rounded-[8px] border border-black/20 bg-white px-[12px] text-[15px] text-bb-ink sm:w-auto"
        >
          {ASSESSMENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="flex w-full overflow-hidden rounded-[8px] border border-black/20 sm:w-auto">
          {(["math", "rw"] as ModuleKey[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeModule(m)}
              className={`h-[38px] flex-1 px-[20px] text-[15px] font-medium sm:flex-none ${
                module === m ? "bg-bb-blue text-white" : "bg-white text-bb-ink hover:bg-black/5"
              }`}
            >
              {MODULES[m].name}
            </button>
          ))}
        </div>

        <div className="flex w-full overflow-hidden rounded-[8px] border border-black/20 sm:w-auto">
          {(
            [
              ["custom", "Custom"],
              ["module", "Mock module"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`h-[38px] flex-1 px-[20px] text-[15px] font-medium sm:flex-none ${
                mode === value ? "bg-bb-blue text-white" : "bg-white text-bb-ink hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "module" && (
        <Card className="mt-[20px] p-[16px] md:p-[24px]">
          <h2 className="text-[20px] font-bold text-bb-ink">
            {MODULES[module].name} module
          </h2>
          <p className="mt-[4px] text-[15px] leading-[1.5] text-black/55">
            A full module on the real clock, built to the blueprint College Board publishes:
            the same number of every skill, in the order the section asks them. It counts
            towards your topic stats and review queue like any other drill.
          </p>

          <div className="mt-[16px] grid gap-[10px] sm:grid-cols-2">
            {([1, 2] as ModulePart[]).map((p) => {
              const bp = blueprintFor(module, p);
              const on = part === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPart(p)}
                  className={`rounded-[8px] border p-[14px] text-left ${
                    on ? "border-bb-blue bg-bb-blue/6" : "border-black/15 hover:border-bb-ink"
                  }`}
                >
                  <span className="flex items-center gap-[8px] text-[16px] font-bold text-bb-ink">
                    Module {p}
                    {p === 2 && (
                      <span className="rounded-full bg-bb-ink px-[8px] py-[2px] text-[11px] font-bold uppercase tracking-wide text-white">
                        Hard
                      </span>
                    )}
                  </span>
                  <span className="mt-[5px] block text-[13px] leading-[1.45] text-black/50">
                    {bp.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          <dl className="mt-[18px] flex flex-wrap gap-x-[26px] gap-y-[8px] text-[14px]">
            {[
              ["Questions", String(blueprint.questions)],
              ["Time", `${Math.round(blueprint.seconds / 60)} min`],
              [
                "Per question",
                `${Math.round(blueprint.seconds / blueprint.questions)}s`,
              ],
              ...(blueprint.sprShare > 0
                ? [["Grid-ins", `${Math.round(blueprint.sprShare * 100)}%`] as const]
                : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-black/45">{label}</dt>
                <dd className="text-[16px] font-bold tabular-nums text-bb-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {/*
            What the module will contain. Domains that publish a per-skill
            breakdown list it underneath; the ones that don't yet — Math — show
            their total alone.
          */}
          <ul className="mt-[16px] space-y-[7px] border-t border-black/8 pt-[14px] text-[14px]">
            {blueprint.domains.map((d) => (
              <li key={d.code}>
                <div className="flex items-center justify-between gap-[14px]">
                  <span className="min-w-0 truncate font-bold text-bb-ink">{d.name}</span>
                  <span className="shrink-0 tabular-nums text-black/50">{range(d)}</span>
                </div>
                {d.skills && (
                  <ul className="mt-[4px] space-y-[3px] pl-[14px]">
                    {d.skills.map((s) => (
                      <li key={s.name} className="flex items-center justify-between gap-[14px]">
                        <span className="min-w-0 truncate text-black/60">{s.name}</span>
                        <span className="shrink-0 tabular-nums text-black/40">{range(s)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-[18px] flex flex-col gap-[10px] border-t border-black/8 pt-[16px]">
            <Toggle
              checked={excludeSeen}
              onChange={setExcludeSeen}
              label="Prefer questions I haven't seen"
              hint="A topic that runs out repeats the one you saw longest ago, rather than giving up its place in the module"
            />
            {module === "math" && (
              <Toggle
                checked={includeLegacy}
                onChange={setIncludeLegacy}
                label="Include legacy disclosed items"
                hint="Older released questions — roughly doubles the math pool"
              />
            )}
          </div>
        </Card>
      )}

      {/* Topics */}
      <Card className={`mt-[20px] p-[16px] md:p-[24px] ${mode === "module" ? "hidden" : ""}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold text-bb-ink">Topics</h2>
          <div className="flex items-center gap-[16px] text-[14px]">
            <span className="text-black/50">
              {selected.size === 0
                ? "All topics"
                : `${selected.size} selected`}
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-bb-blue hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="py-[30px] text-[15px] text-black/50">Loading the question bank…</p>
        ) : (
          <div className="mt-[16px] space-y-[14px]">
            {domains.map((domain) => {
              const isCollapsed = collapsed[domain.code];
              const allOn = domain.skills.every((s) => selected.has(s.name));
              return (
                <div key={domain.code} className="rounded-[8px] border border-black/12">
                  <div className="flex items-center gap-[12px] bg-bb-strip px-[16px] py-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsed((c) => ({ ...c, [domain.code]: !c[domain.code] }))
                      }
                      className="text-bb-ink"
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      <ChevronDown
                        className={`h-[16px] w-[16px] transition-transform ${
                          isCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                    </button>
                    <h3 className="flex-1 text-[16px] font-bold text-bb-ink">{domain.name}</h3>
                    <button
                      type="button"
                      onClick={() => toggleDomain(domain)}
                      className="text-[14px] text-bb-blue hover:underline"
                    >
                      {allOn ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  {!isCollapsed && (
                    <ul className="divide-y divide-black/8">
                      {domain.skills.map((skill) => {
                        const on = selected.has(skill.name);
                        return (
                          <li key={skill.name}>
                            <button
                              type="button"
                              onClick={() => toggleSkill(skill.name)}
                              className={`flex w-full items-center gap-[14px] px-[16px] py-[11px] text-left hover:bg-black/[0.02] ${
                                on ? "bg-bb-blue/6" : ""
                              }`}
                            >
                              <span
                                className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
                                  on ? "border-bb-blue bg-bb-blue text-white" : "border-black/35"
                                }`}
                              >
                                {on && (
                                  <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]">
                                    <path
                                      d="m3.5 8.4 3 3 6-6.6"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] text-bb-ink">
                                  {skill.name}
                                </span>
                                <span className="mt-[2px] block text-[13px] text-black/45">
                                  {skill.available} available
                                  {excludeSeen && skill.total !== skill.available
                                    ? ` of ${skill.total}`
                                    : ""}
                                  {skill.attempted > 0 && ` · ${skill.attempted} done`}
                                </span>
                              </span>

                              <span className="hidden w-[110px] shrink-0 items-center gap-[8px] sm:flex">
                                {skill.accuracy !== null ? (
                                  <>
                                    <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-black/10">
                                      <span
                                        className="block h-full rounded-full"
                                        style={{
                                          width: `${skill.accuracy * 100}%`,
                                          background:
                                            skill.accuracy >= 0.8
                                              ? "#1d7a3e"
                                              : skill.accuracy >= 0.6
                                                ? "#b26a00"
                                                : "#c62828",
                                        }}
                                      />
                                    </span>
                                    <span className="w-[34px] text-right text-[13px] tabular-nums text-black/55">
                                      {Math.round(skill.accuracy * 100)}%
                                    </span>
                                  </>
                                ) : (
                                  <span className="w-full text-right text-[13px] text-black/30">
                                    —
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Options */}
      <Card className={`mt-[20px] p-[16px] md:p-[24px] ${mode === "module" ? "hidden" : ""}`}>
        <h2 className="text-[20px] font-bold text-bb-ink">Options</h2>

        <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
          <span className="w-full text-[15px] text-black/60 sm:w-[110px]">Difficulty</span>
          {DIFFICULTIES.map((d) => {
            const on = difficulties.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setDifficulties((prev) => {
                    const next = new Set(prev);
                    if (next.has(d)) next.delete(d);
                    else next.add(d);
                    return next;
                  })
                }
                className={`h-[34px] rounded-full border px-[16px] text-[14px] font-medium ${
                  on
                    ? "border-bb-blue bg-bb-blue text-white"
                    : "border-black/20 bg-white text-bb-ink hover:border-bb-ink"
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            );
          })}
          {difficulties.size === 0 && (
            <span className="text-[13px] text-black/40">all difficulties</span>
          )}
        </div>

        <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
          <span className="w-full text-[15px] text-black/60 sm:w-[110px]">Questions</span>
          <input
            type="range"
            min={4}
            max={40}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-[4px] min-w-0 flex-1 accent-[#384cc0] sm:w-[280px] sm:flex-none"
          />
          <span className="w-[36px] text-[16px] font-bold tabular-nums text-bb-ink">{count}</span>
          <span className="w-full text-[13px] text-black/40 sm:w-auto">
            {availableForSelection} match your topic filter
          </span>
        </div>

        <div className="mt-[18px] flex flex-col gap-[10px]">
          <Toggle
            checked={excludeSeen}
            onChange={setExcludeSeen}
            label="Only questions I haven't seen"
            hint="Turn off to allow repeats"
          />
          {module === "math" && (
            <Toggle
              checked={includeLegacy}
              onChange={setIncludeLegacy}
              label="Include legacy disclosed items"
              hint="Older released questions — roughly doubles the math pool"
            />
          )}
        </div>
      </Card>

      {error && (
        <p className="mt-[16px] rounded-[8px] bg-[#fdecec] px-[16px] py-[12px] text-[15px] text-[#c62828]">
          {error}
        </p>
      )}

      <div className="mt-[24px] flex flex-col items-start gap-[12px] pb-[40px] sm:flex-row sm:items-center sm:gap-[16px]">
        {mode === "module" ? (
          <>
            <button
              type="button"
              onClick={startModule}
              disabled={creating}
              className="h-[46px] w-full rounded-full bg-bb-blue px-[30px] text-[17px] font-bold text-white hover:bg-bb-blue-hover disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/40 sm:w-auto"
            >
              {creating ? "Assembling…" : "Start module"}
            </button>
            <span className="text-[15px] text-black/50">
              {blueprint.label} · {blueprint.questions} questions ·{" "}
              {Math.round(blueprint.seconds / 60)} min
            </span>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setTimingOpen(true)}
              disabled={loading || availableForSelection === 0}
              className="h-[46px] w-full rounded-full bg-bb-blue px-[30px] text-[17px] font-bold text-white hover:bg-bb-blue-hover disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/40 sm:w-auto"
            >
              Create drill
            </button>
            <span className="text-[15px] text-black/50">
              {selected.size === 0
                ? `Mixed ${MODULES[module].name}`
                : `${selected.size} topic${selected.size === 1 ? "" : "s"}`}{" "}
              · {count} questions
            </span>
          </>
        )}
      </div>

      {timingOpen && (
        <TimingModal
          count={count}
          topics={topicShares}
          busy={creating}
          onCancel={() => setTimingOpen(false)}
          onConfirm={create}
        />
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-fit items-center gap-[12px] text-left"
    >
      <span
        className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition-colors ${
          checked ? "bg-bb-blue" : "bg-black/20"
        }`}
      >
        <span
          className={`h-[16px] w-[16px] rounded-full bg-white transition-transform ${
            checked ? "translate-x-[16px]" : ""
          }`}
        />
      </span>
      <span>
        <span className="block text-[15px] text-bb-ink">{label}</span>
        {hint && <span className="block text-[13px] text-black/45">{hint}</span>}
      </span>
    </button>
  );
}
