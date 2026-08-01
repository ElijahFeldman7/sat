"use client";

/** Student-produced response box, with Bluebook's live answer preview. */
export function SprInput({
  value,
  onChange,
  reveal,
  correctKeys,
  isCorrect,
}: {
  value: string;
  onChange: (v: string) => void;
  reveal?: boolean;
  correctKeys?: string[];
  isCorrect?: boolean;
}) {
  return (
    <div className="max-w-[420px]">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={reveal}
        spellCheck={false}
        autoComplete="off"
        placeholder="Enter your answer"
        className={`h-[46px] w-full rounded-[8px] border bg-white px-[13px] font-bb-serif text-[19px] outline-none focus:border-bb-blue focus:shadow-[inset_0_0_0_1px_var(--color-bb-blue)] ${
          reveal
            ? isCorrect
              ? "border-[#1d7a3e] shadow-[inset_0_0_0_1px_#1d7a3e]"
              : "border-[#c62828] shadow-[inset_0_0_0_1px_#c62828]"
            : "border-bb-border"
        }`}
      />
      <div className="mt-[10px] min-h-[22px] text-[15px] text-bb-ink">
        {value ? (
          <>
            Answer preview: <span className="font-bb-serif text-[18px]">{value}</span>
          </>
        ) : (
          <span className="text-black/45">Answer preview:</span>
        )}
      </div>
      {reveal && correctKeys?.length ? (
        <div className="mt-[6px] text-[15px]">
          <span className="text-black/60">Accepted: </span>
          <span className="font-bb-serif text-[18px] text-[#1d7a3e]">
            {correctKeys.join("  ·  ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
