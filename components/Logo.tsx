/**
 * SAT wordmark — geometric monoline letters drawn as paths, so it renders
 * identically everywhere without depending on a font being installed.
 *
 * All three letters share a 40px cap height, a 30px width and a single stroke
 * weight, which is what makes the trio read as one mark rather than three
 * characters.
 */

const LETTERS = (
  <>
    {/* S — one continuous spine, no flat terminals */}
    <path d="M33 13.5C33 7.5 27 4 19.5 4S6 7.5 6 13.5s6 8.5 13.5 10.5S33 28.5 33 34.5 27 44 19.5 44 6 40.5 6 34.5" />
    {/* A */}
    <path d="M46 44 61 4l15 40" />
    <path d="M51.5 33h19" />
    {/* T */}
    <path d="M88 4.5h36" />
    <path d="M106 4.5V44" />
  </>
);

export function SatMark({
  className = "",
  color = "currentColor",
  strokeWidth = 9,
}: {
  className?: string;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 130 48" className={className} role="img" aria-label="SAT">
      <g
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {LETTERS}
      </g>
    </svg>
  );
}

/** Square plaque — the favicon and small-placement version. */
export function SatBadge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="SAT Drill">
      <rect width="96" height="96" rx="22" fill="#384cc0" />
      <g
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(15 30) scale(0.5)"
      >
        {LETTERS}
      </g>
      {/* The dashed rule that frames every screen of the exam UI. */}
      <g fill="#ffffff" opacity="0.9">
        <rect x="24.5" y="62" width="13" height="4" rx="2" />
        <rect x="41.5" y="62" width="13" height="4" rx="2" />
        <rect x="58.5" y="62" width="13" height="4" rx="2" />
      </g>
    </svg>
  );
}

/** Header lockup: the SAT plaque followed by "Drill". */
export function LogoLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[10px] ${className}`}>
      <SatBadge className="h-[34px] w-[34px]" />
      <span className="text-[22px] font-bold tracking-[-0.015em] text-bb-ink">SAT Drill</span>
    </span>
  );
}
