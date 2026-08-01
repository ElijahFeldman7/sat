"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ASSESSMENTS, DIFFICULTY_LABELS, MODULES } from "@/lib/qbank/types";
import type { Difficulty, ModuleKey } from "@/lib/qbank/types";
import { Card } from "@/components/Card";
import { ChevronDown } from "@/components/exam/icons";
import { TimingModal } from "./TimingModal";

interface TopicSkill {
  name: string;
  total: number;
  available: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
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

  const availableForSelection = useMemo(() => {
    const pool = selected.size ? allSkills.filter((s) => selected.has(s.name)) : allSkills;
    // Difficulty filtering happens server-side; this is the upper bound.
    return pool.reduce((n, s) => n + s.available, 0);
  }, [allSkills, selected]);

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

  return (
    <div className="mx-auto w-full max-w-[1000px] px-[40px] py-[34px]">
      <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-bb-ink">
        Build a drill
      </h1>

      {/* Exam + module */}
      <div className="mt-[22px] flex flex-wrap items-center gap-[10px]">
        <select
          value={assessmentId}
          onChange={(e) => changeAssessment(Number(e.target.value))}
          className="h-[38px] rounded-[8px] border border-black/20 bg-white px-[12px] text-[15px] text-bb-ink"
        >
          {ASSESSMENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-[8px] border border-black/20">
          {(["math", "rw"] as ModuleKey[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeModule(m)}
              className={`h-[38px] px-[20px] text-[15px] font-medium ${
                module === m ? "bg-bb-blue text-white" : "bg-white text-bb-ink hover:bg-black/5"
              }`}
            >
              {MODULES[m].name}
            </button>
          ))}
        </div>
      </div>

      {/* Topics */}
      <Card className="mt-[20px] p-[24px]">
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

                              <span className="flex w-[110px] shrink-0 items-center gap-[8px]">
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
      <Card className="mt-[20px] p-[24px]">
        <h2 className="text-[20px] font-bold text-bb-ink">Options</h2>

        <div className="mt-[16px] flex flex-wrap items-center gap-[10px]">
          <span className="w-[110px] text-[15px] text-black/60">Difficulty</span>
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

        <div className="mt-[18px] flex items-center gap-[10px]">
          <span className="w-[110px] text-[15px] text-black/60">Questions</span>
          <input
            type="range"
            min={4}
            max={40}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-[4px] w-[280px] accent-[#384cc0]"
          />
          <span className="w-[36px] text-[16px] font-bold tabular-nums text-bb-ink">{count}</span>
          <span className="text-[13px] text-black/40">
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

      <div className="mt-[24px] flex items-center gap-[16px] pb-[40px]">
        <button
          type="button"
          onClick={() => setTimingOpen(true)}
          disabled={loading || availableForSelection === 0}
          className="h-[46px] rounded-full bg-bb-blue px-[30px] text-[17px] font-bold text-white hover:bg-bb-blue-hover disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/40"
        >
          Create drill
        </button>
        <span className="text-[15px] text-black/50">
          {selected.size === 0
            ? `Mixed ${MODULES[module].name}`
            : `${selected.size} topic${selected.size === 1 ? "" : "s"}`}{" "}
          · {count} questions
        </span>
      </div>

      {timingOpen && (
        <TimingModal
          count={count}
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
